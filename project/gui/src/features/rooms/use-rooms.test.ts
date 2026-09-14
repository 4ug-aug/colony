import { expect, test } from 'bun:test'
import { reconcileRoomSnapshotRuns } from './use-rooms'
import type { RoomRun } from './types'

const run = (overrides: Partial<RoomRun> = {}): RoomRun => ({
  id: 'run-1',
  roomId: 'general',
  triggerMessageId: 'message-1',
  requestedBy: { kind: 'user', id: 'ada', name: 'Ada' },
  task: 'Help',
  agentId: 'software-engineer',
  provider: 'openai',
  model: 'gpt-4.1-mini',
  state: 'running',
  createdAt: 1,
  stdout: '',
  ...overrides,
})

test('reconnect snapshot removes an active run that finished while disconnected', () => {
  expect(reconcileRoomSnapshotRuns([run()], [])).toEqual([])
})

test('reconnect snapshot preserves loaded terminal history outside its page', () => {
  const completed = run({ state: 'succeeded', completedAt: 2 })
  expect(reconcileRoomSnapshotRuns([completed], [])).toEqual([completed])
})
