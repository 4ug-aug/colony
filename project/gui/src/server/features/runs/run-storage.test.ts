import { expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { migratedDatabase } from '#/server/test-db'
import {
  createRunStepStore,
  failStaleRuns,
  runStep,
  STALE_RUN_ERROR
  
  
} from './run-storage'
import type {RunStepTable, RunTable} from './run-storage';

/** Every step table this store is pointed at in production, with its run table. */
const stepTables: readonly (readonly [RunStepTable, RunTable])[] = [
  ['issue_run_step', 'issue_run'],
  ['schedule_run_step', 'schedule_run'],
]

/** Every run table the stale sweep is pointed at in production. */
const runTables: readonly RunTable[] = ['room_run', 'issue_run', 'schedule_run']

function database(): Database {
  const sqlite = migratedDatabase()
  sqlite.run(`
    INSERT INTO user (id, name, email) VALUES ('user-1', 'Ada', 'ada@example.com');
    INSERT INTO room_message (id, room_id, author_id, author_name, text, created_at)
      VALUES ('message-1', 'general', 'user-1', 'Ada', 'Help', 0);
    INSERT INTO issue (id, number, title, status, priority, created_at, updated_at) VALUES
      ('issue-1', 1, 'Fix it', 'todo', 'none', 0, 0),
      ('issue-2', 2, 'Fix it again', 'todo', 'none', 0, 0),
      ('issue-3', 3, 'Fix it once more', 'todo', 'none', 0, 0);
    INSERT INTO schedule (id, name, agent_definition_id, task, cron_expression, timezone, state, created_by, created_at, updated_at) VALUES
      ('schedule-1', 'Nightly', 'software-engineer', 'Sweep', '0 3 * * *', 'UTC', 'active', 'user-1', 0, 0),
      ('schedule-2', 'Hourly', 'software-engineer', 'Sweep', '0 * * * *', 'UTC', 'active', 'user-1', 0, 0),
      ('schedule-3', 'Weekly', 'software-engineer', 'Sweep', '0 3 * * 1', 'UTC', 'active', 'user-1', 0, 0);
  `)
  return sqlite
}

/**
 * A run row in `table`, so steps have a parent to cascade from. `owner` picks
 * which issue/schedule the run belongs to: `issue_run` and `schedule_run` carry
 * a partial unique index allowing only one active run per owner, so concurrent
 * runs in one test need separate owners.
 */
function seedRun(
  sqlite: Database,
  table: RunTable,
  id: string,
  state = 'running',
  owner = 1,
): void {
  const columns: Record<RunTable, string> = {
    room_run:
      "(id, room_id, trigger_message_id, requested_by_id, requested_by_name, task, agent_id, state, created_at, stdout, stderr) VALUES (?, 'general', 'message-1', 'user-1', 'Ada', 'Help', 'software-engineer', ?, 0, '', '')",
    issue_run: `(id, issue_id, task, agent_id, state, created_at, stdout, stderr) VALUES (?, 'issue-${owner}', 'Help', 'software-engineer', ?, 0, '', '')`,
    schedule_run: `(id, schedule_id, source, task, agent_id, state, created_at, stdout, stderr) VALUES (?, 'schedule-${owner}', 'automatic', 'Sweep', 'software-engineer', ?, 0, '', '')`,
  }
  sqlite.prepare(`INSERT INTO ${table} ${columns[table]}`).run(id, state)
}

for (const [stepTable, runTable] of stepTables) {
  test(`${stepTable}: a step round-trips with its optional columns set`, () => {
    const sqlite = database()
    seedRun(sqlite, runTable, 'run-1')
    const store = createRunStepStore(sqlite, stepTable)
    store.appendStep({
      id: 'step-1',
      runId: 'run-1',
      idx: 0,
      kind: 'tool_call',
      tool: 'shell',
      callId: 'call-1',
      text: 'ls',
      createdAt: 100,
      at: 100,
    })
    expect(store.listSteps('run-1')).toEqual([
      {
        id: 'step-1',
        runId: 'run-1',
        idx: 0,
        kind: 'tool_call',
        tool: 'shell',
        callId: 'call-1',
        text: 'ls',
        createdAt: 100,
        at: 100,
      },
    ])
    sqlite.close()
  })

  test(`${stepTable}: a step with no tool omits the optional keys rather than nulling them`, () => {
    const sqlite = database()
    seedRun(sqlite, runTable, 'run-1')
    const store = createRunStepStore(sqlite, stepTable)
    store.appendStep(runStep('run-1', 0, { kind: 'message', text: 'hi', at: 5 }))
    const [step] = store.listSteps('run-1')
    expect(step).toMatchObject({ runId: 'run-1', idx: 0, text: 'hi', at: 5 })
    expect('tool' in step).toBe(false)
    expect('callId' in step).toBe(false)
    sqlite.close()
  })

  test(`${stepTable}: steps come back in index order, scoped to their run`, () => {
    const sqlite = database()
    seedRun(sqlite, runTable, 'run-1')
    seedRun(sqlite, runTable, 'run-2', 'running', 2)
    const store = createRunStepStore(sqlite, stepTable)
    for (const [runId, idx] of [
      ['run-1', 1],
      ['run-2', 0],
      ['run-1', 0],
    ] as const)
      store.appendStep({
        id: `${runId}-${idx}`,
        runId,
        idx,
        kind: 'message',
        text: `${runId}:${idx}`,
        createdAt: idx,
        at: idx,
      })
    expect(store.listSteps('run-1').map((step) => step.text)).toEqual([
      'run-1:0',
      'run-1:1',
    ])
    sqlite.close()
  })

  test(`${stepTable}: steps cascade away with their run`, () => {
    const sqlite = database()
    seedRun(sqlite, runTable, 'run-1')
    const store = createRunStepStore(sqlite, stepTable)
    store.appendStep(runStep('run-1', 0, { kind: 'message', text: 'hi', at: 5 }))
    sqlite.prepare(`DELETE FROM ${runTable} WHERE id = ?`).run('run-1')
    expect(store.listSteps('run-1')).toEqual([])
    sqlite.close()
  })
}

for (const runTable of runTables) {
  test(`${runTable}: the stale sweep returns only the runs it just failed`, () => {
    const sqlite = database()
    seedRun(sqlite, runTable, 'running', 'running', 1)
    seedRun(sqlite, runTable, 'preparing', 'preparing', 2)
    seedRun(sqlite, runTable, 'done', 'succeeded', 3)

    expect(failStaleRuns(sqlite, runTable, 42).sort()).toEqual([
      'preparing',
      'running',
    ])
    expect(
      sqlite
        .prepare(`SELECT error, completed_at FROM ${runTable} WHERE id = ?`)
        .get('running'),
    ).toEqual({ error: STALE_RUN_ERROR, completed_at: 42 })

    // The bug this replaces: matching on the error text returned every run that
    // ever went stale, so each restart re-notified about ancient failures.
    expect(failStaleRuns(sqlite, runTable, 43)).toEqual([])
    expect(
      sqlite
        .prepare(`SELECT state FROM ${runTable} WHERE id = ?`)
        .get('done'),
    ).toEqual({ state: 'succeeded' })
    sqlite.close()
  })
}
