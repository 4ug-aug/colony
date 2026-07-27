import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  createSqliteRoomStore,
  GENERAL_ROOM_ID,
  type RoomRun,
} from './room-store'

test('room store retains history and fails stale runs', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE room_message (id TEXT PRIMARY KEY, room_id TEXT, author_id TEXT, author_name TEXT, author_image TEXT, text TEXT, created_at INTEGER);
    CREATE TABLE room_run (id TEXT PRIMARY KEY, room_id TEXT, trigger_message_id TEXT, requested_by_id TEXT, requested_by_name TEXT, requested_by_image TEXT, task TEXT, agent_id TEXT, state TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER, exit_code INTEGER, error TEXT, stdout TEXT, stderr TEXT);
  `)
  const store = createSqliteRoomStore(sqlite)
  store.createMessage({
    id: 'message-1',
    roomId: GENERAL_ROOM_ID,
    author: { id: 'user-1', name: 'Ada' },
    text: 'Please help',
    createdAt: 1,
  })
  const run: RoomRun = {
    id: 'run-1',
    roomId: GENERAL_ROOM_ID,
    triggerMessageId: 'message-1',
    requestedBy: { id: 'user-1', name: 'Ada' },
    task: 'Please help',
    agentId: 'software-engineer',
    state: 'running',
    createdAt: 2,
    stdout: '',
    stderr: '',
  }
  store.createRun(run)
  expect(store.listMessages()).toEqual([
    {
      id: 'message-1',
      roomId: GENERAL_ROOM_ID,
      author: { id: 'user-1', name: 'Ada' },
      text: 'Please help',
      createdAt: 1,
    },
  ])
  expect(store.failStaleRuns()).toMatchObject([
    {
      id: 'run-1',
      state: 'failed',
      error: 'Server restarted before the run completed.',
    },
  ])
  expect(store.getRun('run-1')).toMatchObject({
    state: 'failed',
    completedAt: expect.any(Number),
  })
  sqlite.close()
})
