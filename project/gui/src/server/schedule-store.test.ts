import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  createSqliteScheduleStore,
  type NewScheduleRun,
} from './schedule-store'

const schema = `
  CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, image TEXT);
  INSERT INTO user VALUES ('ada', 'Ada', NULL);
  CREATE TABLE schedule (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, agent_definition_id TEXT NOT NULL,
    task TEXT NOT NULL, cron_expression TEXT NOT NULL, timezone TEXT NOT NULL,
    state TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES user(id),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, next_run_at INTEGER
  );
  CREATE TABLE schedule_run (
    id TEXT PRIMARY KEY, schedule_id TEXT NOT NULL REFERENCES schedule(id) ON DELETE CASCADE,
    source TEXT NOT NULL, scheduled_for INTEGER, started_by TEXT REFERENCES user(id),
    task TEXT NOT NULL, agent_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL,
    started_at INTEGER, completed_at INTEGER, exit_code INTEGER, error TEXT,
    stdout TEXT NOT NULL, stderr TEXT NOT NULL
  );
  CREATE UNIQUE INDEX schedule_one_active_run_idx ON schedule_run(schedule_id) WHERE state IN ('preparing', 'running');
  CREATE TABLE schedule_run_step (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES schedule_run(id), idx INTEGER NOT NULL,
    kind TEXT NOT NULL, tool TEXT, call_id TEXT, text TEXT NOT NULL, created_at INTEGER NOT NULL
  );
`

const run = (
  id: string,
  source: 'automatic' | 'manual',
  scheduledFor?: number,
): NewScheduleRun => ({
  id,
  scheduleId: 'schedule-1',
  source,
  ...(scheduledFor === undefined ? {} : { scheduledFor }),
  task: 'Check the repo',
  agentId: 'software-engineer',
  provider: 'openai',
  model: 'gpt-4.1-mini',
  state: 'preparing',
  createdAt: 10,
  stdout: '',
  stderr: '',
})

test('schedule store enforces one active run and advances automatic cadence transactionally', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(schema)
  const store = createSqliteScheduleStore(sqlite)
  store.createSchedule({
    id: 'schedule-1',
    name: 'Repo check',
    agentDefinitionId: 'software-engineer',
    task: 'Check the repo',
    cronExpression: '* * * * *',
    timezone: 'Europe/Copenhagen',
    state: 'active',
    createdBy: 'ada',
    createdAt: 1,
    nextRunAt: 1,
  })

  expect(store.createRun(run('manual-1', 'manual'), 10)?.id).toBe('manual-1')
  expect(store.createRun(run('manual-2', 'manual'), 10)).toBeUndefined()
  store.updateRun({
    ...store.getRun('manual-1')!,
    state: 'succeeded',
    completedAt: 20,
  })
  const automatic = store.createRun(run('automatic-1', 'automatic', 1), 20)
  expect(automatic).toMatchObject({ source: 'automatic', scheduledFor: 1 })
  expect(store.getSchedule('schedule-1')?.nextRunAt).toBeGreaterThan(20)
  sqlite.close()
})
