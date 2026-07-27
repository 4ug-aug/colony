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
    CREATE TABLE room (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO room (id, name) VALUES ('general', 'General');
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
  expect(store.listMessages(GENERAL_ROOM_ID)).toEqual([
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

test('room store creates ordered, isolated rooms', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE room (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE UNIQUE INDEX room_name_nocase_unique ON room (name COLLATE NOCASE);
    INSERT INTO room (id, name) VALUES ('general', 'General');
    CREATE TABLE room_message (id TEXT PRIMARY KEY, room_id TEXT, author_id TEXT, author_name TEXT, author_image TEXT, text TEXT, created_at INTEGER);
    CREATE TABLE room_run (id TEXT PRIMARY KEY, room_id TEXT, trigger_message_id TEXT, requested_by_id TEXT, requested_by_name TEXT, requested_by_image TEXT, task TEXT, agent_id TEXT, state TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER, exit_code INTEGER, error TEXT, stdout TEXT, stderr TEXT);
  `)
  const store = createSqliteRoomStore(sqlite)
  expect(store.createRoom({ id: 'zebra', name: 'Zebra' })).toBe(true)
  expect(store.createRoom({ id: 'alpha', name: 'alpha' })).toBe(true)
  expect(store.createRoom({ id: 'duplicate', name: 'ALPHA' })).toBe(false)
  expect(store.listRooms()).toEqual([
    { id: 'general', name: 'General' },
    { id: 'alpha', name: 'alpha' },
    { id: 'zebra', name: 'Zebra' },
  ])
  store.createMessage({
    id: 'product-message',
    roomId: 'alpha',
    author: { id: 'user-1', name: 'Ada' },
    text: 'Product',
    createdAt: 1,
  })
  expect(store.getRoom('alpha')).toEqual({ id: 'alpha', name: 'alpha' })
  expect(store.listMessages(GENERAL_ROOM_ID)).toEqual([])
  expect(store.listMessages('alpha')).toHaveLength(1)
  store.createMessage({
    id: 'general-message',
    roomId: GENERAL_ROOM_ID,
    author: { id: 'user-1', name: 'Ada' },
    text: 'General',
    createdAt: 2,
  })
  for (const [id, roomId, triggerMessageId] of [
    ['general-run', GENERAL_ROOM_ID, 'general-message'],
    ['alpha-run', 'alpha', 'product-message'],
  ] as const) {
    store.createRun({
      id,
      roomId,
      triggerMessageId,
      requestedBy: { id: 'user-1', name: 'Ada' },
      task: 'Help',
      agentId: 'software-engineer',
      state: 'preparing',
      createdAt: 3,
      stdout: '',
      stderr: '',
    })
  }
  expect(store.listRuns(GENERAL_ROOM_ID).map(({ id }) => id)).toEqual([
    'general-run',
  ])
  expect(store.listRuns('alpha').map(({ id }) => id)).toEqual(['alpha-run'])
  sqlite.close()
})
