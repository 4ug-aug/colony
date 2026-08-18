import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  createRunStepStore,
  failStaleRuns,
  runStep,
  STALE_RUN_ERROR,
} from './run-storage'

const schema = `
  CREATE TABLE issue_run (
    id TEXT PRIMARY KEY, state TEXT NOT NULL, error TEXT, completed_at INTEGER
  );
  CREATE TABLE issue_run_step (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL,
    kind TEXT NOT NULL, tool TEXT, call_id TEXT, text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`

function database() {
  const sqlite = new Database(':memory:')
  sqlite.run(schema)
  return sqlite
}

test('a step round-trips with its optional columns set', () => {
  const sqlite = database()
  const store = createRunStepStore(sqlite, 'issue_run_step')
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

test('a step with no tool omits the optional keys rather than nulling them', () => {
  const sqlite = database()
  const store = createRunStepStore(sqlite, 'issue_run_step')
  store.appendStep(runStep('run-1', 0, { kind: 'message', text: 'hi', at: 5 }))
  const [step] = store.listSteps('run-1')
  expect(step).toMatchObject({ runId: 'run-1', idx: 0, text: 'hi', at: 5 })
  expect('tool' in step!).toBe(false)
  expect('callId' in step!).toBe(false)
  sqlite.close()
})

test('steps come back in index order, scoped to their run', () => {
  const sqlite = database()
  const store = createRunStepStore(sqlite, 'issue_run_step')
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

test('the stale sweep returns only the runs it just failed', () => {
  const sqlite = database()
  const insert = (id: string, state: string) =>
    sqlite
      .prepare('INSERT INTO issue_run (id, state) VALUES (?, ?)')
      .run(id, state)
  insert('running', 'running')
  insert('preparing', 'preparing')
  insert('done', 'succeeded')

  expect(failStaleRuns(sqlite, 'issue_run', 42).sort()).toEqual([
    'preparing',
    'running',
  ])
  expect(
    sqlite
      .prepare('SELECT error, completed_at FROM issue_run WHERE id = ?')
      .get('running'),
  ).toEqual({ error: STALE_RUN_ERROR, completed_at: 42 })

  // The bug this replaces: matching on the error text returned every run that
  // ever went stale, so each restart re-notified about ancient failures.
  expect(failStaleRuns(sqlite, 'issue_run', 43)).toEqual([])
  expect(
    sqlite.prepare('SELECT state FROM issue_run WHERE id = ?').get('done'),
  ).toEqual({ state: 'succeeded' })
  sqlite.close()
})
