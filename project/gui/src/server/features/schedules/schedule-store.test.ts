import { migratedDatabase, seedAccounts } from '#/server/test-db'
import { expect, test } from 'bun:test'
import {
  createSqliteScheduleStore,
  type NewScheduleRun,
} from './schedule-store'


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
  const sqlite = migratedDatabase()
  seedAccounts(sqlite, ['ada'])
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
