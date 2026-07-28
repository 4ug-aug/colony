import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  createSqliteRoomStore,
  GENERAL_ROOM_ID,
  type RoomRun,
  type StoredStep,
} from './room-store'

const SCHEMA_DDL = `
  CREATE TABLE room (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  INSERT INTO room (id, name) VALUES ('general', 'General');
  CREATE TABLE room_message (id TEXT PRIMARY KEY, room_id TEXT, author_id TEXT, author_name TEXT, author_image TEXT, author_kind TEXT DEFAULT 'user' NOT NULL, text TEXT, created_at INTEGER);
  CREATE TABLE room_run (id TEXT PRIMARY KEY, room_id TEXT, trigger_message_id TEXT, requested_by_id TEXT, requested_by_name TEXT, requested_by_image TEXT, task TEXT, agent_id TEXT, state TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER, exit_code INTEGER, error TEXT, stdout TEXT, stderr TEXT);
  CREATE TABLE run_step (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, room_id TEXT NOT NULL, idx INTEGER NOT NULL, kind TEXT NOT NULL, tool TEXT, call_id TEXT, text TEXT NOT NULL, created_at INTEGER NOT NULL);
`

function makeRun(overrides: Partial<RoomRun> = {}): RoomRun {
  return {
    id: 'run-1',
    roomId: GENERAL_ROOM_ID,
    triggerMessageId: 'msg-1',
    requestedBy: { id: 'user-1', name: 'Ada' },
    task: 'Help',
    agentId: 'software-engineer',
    state: 'running',
    createdAt: 1,
    stdout: '',
    stderr: '',
    ...overrides,
  }
}

function makeStep(overrides: Partial<StoredStep> = {}): StoredStep {
  return {
    id: 'step-1',
    runId: 'run-1',
    roomId: GENERAL_ROOM_ID,
    idx: 0,
    kind: 'message',
    text: 'hello',
    createdAt: 100,
    ...overrides,
  }
}

test('room store retains history and fails stale runs', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE room (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO room (id, name) VALUES ('general', 'General');
    CREATE TABLE room_message (id TEXT PRIMARY KEY, room_id TEXT, author_id TEXT, author_name TEXT, author_image TEXT, author_kind TEXT DEFAULT 'user' NOT NULL, text TEXT, created_at INTEGER);
    CREATE TABLE room_run (id TEXT PRIMARY KEY, room_id TEXT, trigger_message_id TEXT, requested_by_id TEXT, requested_by_name TEXT, requested_by_image TEXT, task TEXT, agent_id TEXT, state TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER, exit_code INTEGER, error TEXT, stdout TEXT, stderr TEXT);
  `)
  const store = createSqliteRoomStore(sqlite)
  store.createMessage({
    id: 'message-1',
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
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
      author: { kind: 'user', id: 'user-1', name: 'Ada' },
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
    CREATE TABLE room_message (id TEXT PRIMARY KEY, room_id TEXT, author_id TEXT, author_name TEXT, author_image TEXT, author_kind TEXT DEFAULT 'user' NOT NULL, text TEXT, created_at INTEGER);
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
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Product',
    createdAt: 1,
  })
  expect(store.getRoom('alpha')).toEqual({ id: 'alpha', name: 'alpha' })
  expect(store.listMessages(GENERAL_ROOM_ID)).toEqual([])
  expect(store.listMessages('alpha')).toHaveLength(1)
  store.createMessage({
    id: 'general-message',
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
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

test('appendStep then listSteps returns steps ordered by idx', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)
  store.createMessage({ id: 'msg-1', roomId: GENERAL_ROOM_ID, author: { kind: 'user', id: 'user-1', name: 'Ada' }, text: 'hi', createdAt: 1 })
  store.createRun(makeRun())

  store.appendStep(makeStep({ id: 'step-2', idx: 1, text: 'second', createdAt: 102 }))
  store.appendStep(makeStep({ id: 'step-1', idx: 0, text: 'first', createdAt: 101 }))
  store.appendStep(makeStep({ id: 'step-3', idx: 2, kind: 'tool_call', tool: 'bash', callId: 'call-1', text: 'ls', createdAt: 103 }))

  const steps = store.listSteps('run-1')
  expect(steps.map(s => s.idx)).toEqual([0, 1, 2])
  expect(steps[0].text).toBe('first')
  expect(steps[1].text).toBe('second')
  expect(steps[2].kind).toBe('tool_call')
  expect(steps[2].tool).toBe('bash')
  expect(steps[2].callId).toBe('call-1')

  sqlite.close()
})

test('latestStepsForActiveRuns returns max-idx step per active run only', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)
  store.createMessage({ id: 'msg-1', roomId: GENERAL_ROOM_ID, author: { kind: 'user', id: 'user-1', name: 'Ada' }, text: 'hi', createdAt: 1 })
  store.createMessage({ id: 'msg-2', roomId: GENERAL_ROOM_ID, author: { kind: 'user', id: 'user-1', name: 'Ada' }, text: 'hi', createdAt: 2 })
  store.createMessage({ id: 'msg-3', roomId: GENERAL_ROOM_ID, author: { kind: 'user', id: 'user-1', name: 'Ada' }, text: 'hi', createdAt: 3 })

  store.createRun(makeRun({ id: 'run-active', state: 'running', triggerMessageId: 'msg-1' }))
  store.createRun(makeRun({ id: 'run-preparing', state: 'preparing', triggerMessageId: 'msg-2' }))
  store.createRun(makeRun({ id: 'run-done', state: 'succeeded', triggerMessageId: 'msg-3' }))

  // Active run with two steps
  store.appendStep(makeStep({ id: 's1', runId: 'run-active', idx: 0, text: 'early', createdAt: 10 }))
  store.appendStep(makeStep({ id: 's2', runId: 'run-active', idx: 1, text: 'latest', createdAt: 20 }))

  // Preparing run with no steps yet
  // Succeeded run with a step (should be excluded)
  store.appendStep(makeStep({ id: 's3', runId: 'run-done', idx: 0, text: 'done step', createdAt: 5 }))

  const latest = store.latestStepsForActiveRuns(GENERAL_ROOM_ID)
  expect(latest.size).toBe(1)
  expect(latest.has('run-active')).toBe(true)
  expect(latest.get('run-active')?.text).toBe('latest')
  expect(latest.get('run-active')?.idx).toBe(1)
  expect(latest.has('run-done')).toBe(false)
  expect(latest.has('run-preparing')).toBe(false)

  sqlite.close()
})

test('listSteps is scoped to its run', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)
  store.createMessage({ id: 'msg-1', roomId: GENERAL_ROOM_ID, author: { kind: 'user', id: 'user-1', name: 'Ada' }, text: 'hi', createdAt: 1 })
  store.createMessage({ id: 'msg-2', roomId: GENERAL_ROOM_ID, author: { kind: 'user', id: 'user-1', name: 'Ada' }, text: 'hi', createdAt: 2 })

  store.createRun(makeRun({ id: 'run-A', triggerMessageId: 'msg-1' }))
  store.createRun(makeRun({ id: 'run-B', triggerMessageId: 'msg-2' }))

  store.appendStep(makeStep({ id: 'step-A', runId: 'run-A', idx: 0, text: 'A step' }))
  store.appendStep(makeStep({ id: 'step-B', runId: 'run-B', idx: 0, text: 'B step' }))

  expect(store.listSteps('run-A').map(s => s.id)).toEqual(['step-A'])
  expect(store.listSteps('run-B').map(s => s.id)).toEqual(['step-B'])
  expect(store.listSteps('run-missing')).toEqual([])

  sqlite.close()
})
