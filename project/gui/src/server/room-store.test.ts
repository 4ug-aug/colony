import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  createSqliteRoomStore,
  GENERAL_ROOM_ID,
  type RoomRun,
  type StoredStep,
} from './room-store'

const SCHEMA_DDL = `
  CREATE TABLE room (id TEXT PRIMARY KEY, name TEXT NOT NULL, visibility TEXT DEFAULT 'public' NOT NULL, created_by TEXT);
  INSERT INTO room (id, name, visibility) VALUES ('general', 'General', 'public');
  CREATE TABLE room_member (room_id TEXT NOT NULL REFERENCES room(id) ON DELETE cascade, user_id TEXT NOT NULL, added_by TEXT, added_at INTEGER NOT NULL, PRIMARY KEY (room_id, user_id));
  CREATE INDEX room_member_user_idx ON room_member (user_id);
  CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, image TEXT, username TEXT, banned INTEGER);
  INSERT INTO user (id, name, email, image, username) VALUES ('user-1', 'Ada Lovelace', 'ada@example.com', NULL, 'ada');
  INSERT INTO user (id, name, email, image, username) VALUES ('user-2', 'Bob Builder', 'bob@example.com', 'https://example.com/bob.png', 'bob');
  CREATE TABLE room_message (id TEXT PRIMARY KEY, room_id TEXT, author_id TEXT, author_name TEXT, author_image TEXT, author_kind TEXT DEFAULT 'user' NOT NULL, text TEXT, created_at INTEGER);
  CREATE TABLE room_run (id TEXT PRIMARY KEY, room_id TEXT, trigger_message_id TEXT, requested_by_id TEXT, requested_by_name TEXT, requested_by_image TEXT, task TEXT, agent_id TEXT, state TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER, exit_code INTEGER, error TEXT, stdout TEXT, stderr TEXT);
  CREATE TABLE run_step (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, room_id TEXT NOT NULL, idx INTEGER NOT NULL, kind TEXT NOT NULL, tool TEXT, call_id TEXT, text TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE room_attention (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES room(id) ON DELETE cascade, recipient_id TEXT NOT NULL REFERENCES user(id) ON DELETE cascade, kind TEXT NOT NULL, source_id TEXT NOT NULL, created_at INTEGER NOT NULL, acknowledged_at INTEGER, UNIQUE(recipient_id, kind, source_id));
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
    CREATE TABLE room (id TEXT PRIMARY KEY, name TEXT NOT NULL, visibility TEXT DEFAULT 'public' NOT NULL, created_by TEXT);
    INSERT INTO room (id, name, visibility) VALUES ('general', 'General', 'public');
    CREATE TABLE room_member (room_id TEXT NOT NULL, user_id TEXT NOT NULL, added_by TEXT, added_at INTEGER NOT NULL, PRIMARY KEY (room_id, user_id));
    CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, image TEXT);
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
      attachments: [],
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

test('room history pages newest messages and follows an opaque cursor', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)
  for (const [id, createdAt] of [
    ['msg-1', 1],
    ['msg-2', 2],
    ['msg-3', 3],
  ] as const)
    store.createMessage({
      id,
      roomId: GENERAL_ROOM_ID,
      author: { kind: 'user', id: 'user-1', name: 'Ada' },
      text: id,
      createdAt,
    })
  store.createRun(
    makeRun({ id: 'run-old', triggerMessageId: 'msg-1', state: 'succeeded' }),
  )
  store.createRun(makeRun({ id: 'run-current', triggerMessageId: 'msg-2' }))

  const newest = store.listRoomHistoryPage(GENERAL_ROOM_ID, { limit: 2 })
  expect(newest.messages.map(({ id }) => id)).toEqual(['msg-2', 'msg-3'])
  expect(newest.runs.map(({ id }) => id)).toEqual(['run-current'])
  expect(newest.nextCursor).toEqual(expect.any(String))

  const oldest = store.listRoomHistoryPage(GENERAL_ROOM_ID, {
    limit: 2,
    cursor: newest.nextCursor,
  })
  expect(oldest.messages.map(({ id }) => id)).toEqual(['msg-1'])
  expect(oldest.runs.map(({ id }) => id)).toEqual(['run-current', 'run-old'])
  expect(oldest.nextCursor).toBeUndefined()
  expect(() =>
    store.listRoomHistoryPage(GENERAL_ROOM_ID, { limit: 2, cursor: '' }),
  ).toThrow('Invalid room history cursor')

  sqlite.close()
})

test('room messages expose attachment metadata without storage details', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`${SCHEMA_DDL}
    CREATE TABLE room_attachment (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES room_message(id) ON DELETE CASCADE,
      filename TEXT NOT NULL, content_type TEXT NOT NULL, byte_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
    );
    CREATE INDEX room_attachment_message_idx ON room_attachment(message_id);
  `)
  const store = createSqliteRoomStore(sqlite)
  store.createMessage(
    {
      id: 'message-with-file',
      roomId: GENERAL_ROOM_ID,
      author: { kind: 'user', id: 'user-1', name: 'Ada' },
      text: '',
      createdAt: 1,
      attachments: [],
    },
    [
      {
        id: 'attachment-1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        byteSize: 42,
        sha256: 'private-hash',
        storageKey: 'private-key',
        createdAt: 1,
      },
    ],
  )

  expect(store.listMessages(GENERAL_ROOM_ID)).toMatchObject([
    {
      id: 'message-with-file',
      attachments: [
        {
          id: 'attachment-1',
          filename: 'report.pdf',
          contentType: 'application/pdf',
          byteSize: 42,
        },
      ],
    },
  ])
  expect(JSON.stringify(store.listMessages(GENERAL_ROOM_ID))).not.toContain(
    'private-key',
  )
  expect(store.getAttachment('attachment-1')).toMatchObject({
    storageKey: 'private-key',
    sha256: 'private-hash',
  })
  expect(store.listAttachmentStorageKeys(GENERAL_ROOM_ID)).toEqual([
    'private-key',
  ])
  sqlite.close()
})

test('room store creates ordered, isolated rooms', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE room (id TEXT PRIMARY KEY, name TEXT NOT NULL, visibility TEXT DEFAULT 'public' NOT NULL, created_by TEXT);
    CREATE UNIQUE INDEX room_name_nocase_unique ON room (name COLLATE NOCASE);
    INSERT INTO room (id, name, visibility) VALUES ('general', 'General', 'public');
    CREATE TABLE room_member (room_id TEXT NOT NULL, user_id TEXT NOT NULL, added_by TEXT, added_at INTEGER NOT NULL, PRIMARY KEY (room_id, user_id));
    CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, image TEXT);
    CREATE TABLE room_message (id TEXT PRIMARY KEY, room_id TEXT, author_id TEXT, author_name TEXT, author_image TEXT, author_kind TEXT DEFAULT 'user' NOT NULL, text TEXT, created_at INTEGER);
    CREATE TABLE room_run (id TEXT PRIMARY KEY, room_id TEXT, trigger_message_id TEXT, requested_by_id TEXT, requested_by_name TEXT, requested_by_image TEXT, task TEXT, agent_id TEXT, state TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER, exit_code INTEGER, error TEXT, stdout TEXT, stderr TEXT);
  `)
  const store = createSqliteRoomStore(sqlite)
  expect(
    store.createRoom({ id: 'zebra', name: 'Zebra', visibility: 'public' }),
  ).toBe(true)
  expect(
    store.createRoom({ id: 'alpha', name: 'alpha', visibility: 'public' }),
  ).toBe(true)
  expect(
    store.createRoom({ id: 'duplicate', name: 'ALPHA', visibility: 'public' }),
  ).toBe(false)
  expect(store.listRooms()).toEqual([
    { id: 'general', name: 'General', visibility: 'public' },
    { id: 'alpha', name: 'alpha', visibility: 'public' },
    { id: 'zebra', name: 'Zebra', visibility: 'public' },
  ])
  store.createMessage({
    id: 'product-message',
    roomId: 'alpha',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Product',
    createdAt: 1,
  })
  expect(store.getRoom('alpha')).toEqual({
    id: 'alpha',
    name: 'alpha',
    visibility: 'public',
  })
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
  store.createMessage({
    id: 'msg-1',
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'hi',
    createdAt: 1,
  })
  store.createRun(makeRun())

  store.appendStep(
    makeStep({ id: 'step-2', idx: 1, text: 'second', createdAt: 102 }),
  )
  store.appendStep(
    makeStep({ id: 'step-1', idx: 0, text: 'first', createdAt: 101 }),
  )
  store.appendStep(
    makeStep({
      id: 'step-3',
      idx: 2,
      kind: 'tool_call',
      tool: 'bash',
      callId: 'call-1',
      text: 'ls',
      createdAt: 103,
    }),
  )

  const steps = store.listSteps('run-1')
  expect(steps.map((s) => s.idx)).toEqual([0, 1, 2])
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
  store.createMessage({
    id: 'msg-1',
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'hi',
    createdAt: 1,
  })
  store.createMessage({
    id: 'msg-2',
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'hi',
    createdAt: 2,
  })
  store.createMessage({
    id: 'msg-3',
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'hi',
    createdAt: 3,
  })

  store.createRun(
    makeRun({ id: 'run-active', state: 'running', triggerMessageId: 'msg-1' }),
  )
  store.createRun(
    makeRun({
      id: 'run-preparing',
      state: 'preparing',
      triggerMessageId: 'msg-2',
    }),
  )
  store.createRun(
    makeRun({ id: 'run-done', state: 'succeeded', triggerMessageId: 'msg-3' }),
  )

  // Active run with two steps
  store.appendStep(
    makeStep({
      id: 's1',
      runId: 'run-active',
      idx: 0,
      text: 'early',
      createdAt: 10,
    }),
  )
  store.appendStep(
    makeStep({
      id: 's2',
      runId: 'run-active',
      idx: 1,
      text: 'latest',
      createdAt: 20,
    }),
  )

  // Preparing run with no steps yet
  // Succeeded run with a step (should be excluded)
  store.appendStep(
    makeStep({
      id: 's3',
      runId: 'run-done',
      idx: 0,
      text: 'done step',
      createdAt: 5,
    }),
  )

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
  store.createMessage({
    id: 'msg-1',
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'hi',
    createdAt: 1,
  })
  store.createMessage({
    id: 'msg-2',
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'hi',
    createdAt: 2,
  })

  store.createRun(makeRun({ id: 'run-A', triggerMessageId: 'msg-1' }))
  store.createRun(makeRun({ id: 'run-B', triggerMessageId: 'msg-2' }))

  store.appendStep(
    makeStep({ id: 'step-A', runId: 'run-A', idx: 0, text: 'A step' }),
  )
  store.appendStep(
    makeStep({ id: 'step-B', runId: 'run-B', idx: 0, text: 'B step' }),
  )

  expect(store.listSteps('run-A').map((s) => s.id)).toEqual(['step-A'])
  expect(store.listSteps('run-B').map((s) => s.id)).toEqual(['step-B'])
  expect(store.listSteps('run-missing')).toEqual([])

  sqlite.close()
})

test('creating a private room seeds the owner as a member', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)

  store.createRoom({
    id: 'secret',
    name: 'Secret',
    visibility: 'private',
    createdBy: 'user-1',
  })

  const members = store.listMembers('secret')
  expect(members).toHaveLength(1)
  expect(members[0].id).toBe('user-1')
  expect(members[0].name).toBe('ada')

  sqlite.close()
})

test('creating a public room does not seed any member', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)

  store.createRoom({
    id: 'open',
    name: 'Open',
    visibility: 'public',
    createdBy: 'user-1',
  })

  expect(store.listMembers('open')).toHaveLength(0)

  sqlite.close()
})

test('canAccessRoom — public room is accessible by any user', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)

  // general is public and seeded in SCHEMA_DDL
  expect(store.canAccessRoom(GENERAL_ROOM_ID, 'user-1')).toBe(true)
  expect(store.canAccessRoom(GENERAL_ROOM_ID, 'user-2')).toBe(true)
  expect(store.canAccessRoom(GENERAL_ROOM_ID, 'stranger')).toBe(true)

  sqlite.close()
})

test('canAccessRoom — private room only allows members', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)

  store.createRoom({
    id: 'priv',
    name: 'Private',
    visibility: 'private',
    createdBy: 'user-1',
  })

  expect(store.canAccessRoom('priv', 'user-1')).toBe(true) // owner was seeded as member
  expect(store.canAccessRoom('priv', 'user-2')).toBe(false) // not a member
  expect(store.canAccessRoom('priv', 'stranger')).toBe(false)

  sqlite.close()
})

test('canAccessRoom — missing room returns false', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)

  expect(store.canAccessRoom('no-such-room', 'user-1')).toBe(false)

  sqlite.close()
})

test('listRoomsForUser hides private rooms you are not in', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)

  store.createRoom({ id: 'pub', name: 'Public Room', visibility: 'public' })
  store.createRoom({
    id: 'priv1',
    name: 'Priv1',
    visibility: 'private',
    createdBy: 'user-1',
  })
  store.createRoom({
    id: 'priv2',
    name: 'Priv2',
    visibility: 'private',
    createdBy: 'user-2',
  })

  const forUser1 = store.listRoomsForUser('user-1')
  const ids1 = forUser1.map((r) => r.id)
  expect(ids1).toContain(GENERAL_ROOM_ID)
  expect(ids1).toContain('pub')
  expect(ids1).toContain('priv1') // owner → member
  expect(ids1).not.toContain('priv2')

  const forUser2 = store.listRoomsForUser('user-2')
  const ids2 = forUser2.map((r) => r.id)
  expect(ids2).toContain(GENERAL_ROOM_ID)
  expect(ids2).toContain('pub')
  expect(ids2).not.toContain('priv1')
  expect(ids2).toContain('priv2')

  sqlite.close()
})

test('listRoomsForUser keeps General first', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)

  store.createRoom({ id: 'aaa', name: 'AAA', visibility: 'public' })
  store.createRoom({ id: 'zzz', name: 'ZZZ', visibility: 'public' })

  const rooms = store.listRoomsForUser('user-1')
  expect(rooms[0].id).toBe(GENERAL_ROOM_ID)

  sqlite.close()
})

test('addMember is idempotent', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)

  store.createRoom({
    id: 'priv',
    name: 'Priv',
    visibility: 'private',
    createdBy: 'user-1',
  })
  // user-1 already a member (seeded); add again — should not throw
  expect(() => store.addMember('priv', 'user-1', 'user-1')).not.toThrow()
  expect(store.listMembers('priv')).toHaveLength(1)

  // add user-2
  store.addMember('priv', 'user-2', 'user-1')
  expect(store.listMembers('priv')).toHaveLength(2)
  // add user-2 again — idempotent
  store.addMember('priv', 'user-2', 'user-1')
  expect(store.listMembers('priv')).toHaveLength(2)

  sqlite.close()
})

test('removeMember removes the member', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)

  store.createRoom({
    id: 'priv',
    name: 'Priv',
    visibility: 'private',
    createdBy: 'user-1',
  })
  store.addMember('priv', 'user-2', 'user-1')
  expect(store.listMembers('priv')).toHaveLength(2)
  store.createAttention({
    id: 'attention-1',
    roomId: 'priv',
    recipientId: 'user-2',
    kind: 'mention',
    sourceId: 'message-1',
    createdAt: 1,
  })

  store.removeMember('priv', 'user-2')
  expect(store.listMembers('priv')).toHaveLength(1)
  expect(store.listMembers('priv')[0].id).toBe('user-1')
  expect(store.listAttentionCounts('user-2').size).toBe(0)

  sqlite.close()
})

test('isOwner returns true only for the creator', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)

  store.createRoom({
    id: 'priv',
    name: 'Priv',
    visibility: 'private',
    createdBy: 'user-1',
  })

  expect(store.isOwner('priv', 'user-1')).toBe(true)
  expect(store.isOwner('priv', 'user-2')).toBe(false)
  expect(store.isOwner('no-such-room', 'user-1')).toBe(false)

  sqlite.close()
})

test('deleteRoom removes the room and its records', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE room (id TEXT PRIMARY KEY, name TEXT NOT NULL, visibility TEXT DEFAULT 'public' NOT NULL, created_by TEXT);
    CREATE TABLE room_message (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES room(id) ON DELETE cascade);
    INSERT INTO room VALUES ('room-1', 'Room', 'public', 'user-1');
    INSERT INTO room_message VALUES ('message-1', 'room-1');
  `)
  const store = createSqliteRoomStore(sqlite)

  expect(store.deleteRoom('room-1')).toBe(true)
  expect(store.getRoom('room-1')).toBeUndefined()
  expect(
    sqlite.prepare('SELECT COUNT(*) AS count FROM room_message').get(),
  ).toEqual({ count: 0 })
  expect(store.deleteRoom('room-1')).toBe(false)

  sqlite.close()
})

test('member and message profiles use username with durable secondary details', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)

  store.createRoom({
    id: 'priv',
    name: 'Priv',
    visibility: 'private',
    createdBy: 'user-1',
  })
  store.addMember('priv', 'user-2', 'user-1')

  const members = store.listMembers('priv')
  const ada = members.find((m) => m.id === 'user-1')!
  const bob = members.find((m) => m.id === 'user-2')!
  expect(ada).toMatchObject({
    name: 'ada',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
  })
  expect(ada.image).toBeUndefined()
  expect(bob.name).toBe('bob')
  expect(bob.image).toBe('https://example.com/bob.png')
  store.createMessage({
    id: 'message-1',
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-1', name: 'ada' },
    text: 'Hello',
    createdAt: 1,
  })
  expect(store.listMessages(GENERAL_ROOM_ID)[0]?.author).toMatchObject({
    name: 'ada',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
  })

  sqlite.close()
})

test('listWorkspaceUsers returns all users ordered by name', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)

  const users = store.listWorkspaceUsers()
  expect(users).toHaveLength(2)
  expect(users[0].id).toBe('user-1') // Ada before Bob
  expect(users[1].id).toBe('user-2')
  expect(users[0].image).toBeUndefined()
  expect(users[1].image).toBe('https://example.com/bob.png')

  sqlite.close()
})

test('mentionable accounts are active and scoped to the room', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_DDL)
  sqlite.exec(`
    INSERT INTO user (id, name, username, banned)
    VALUES ('user-3', 'Suspended', 'suspended', 1);
  `)
  const store = createSqliteRoomStore(sqlite)

  expect(
    store
      .listMentionableAccounts(GENERAL_ROOM_ID)
      .map(({ username }) => username),
  ).toEqual(['ada', 'bob'])

  store.createRoom({
    id: 'private',
    name: 'Private',
    visibility: 'private',
    createdBy: 'user-1',
  })
  expect(
    store.listMentionableAccounts('private').map(({ username }) => username),
  ).toEqual(['ada'])
  store.addMember('private', 'user-2', 'user-1')
  expect(
    store.listMentionableAccounts('private').map(({ username }) => username),
  ).toEqual(['ada', 'bob'])

  sqlite.close()
})

test('attention is idempotent, countable, and acknowledged per room', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  sqlite.exec(SCHEMA_DDL)
  const store = createSqliteRoomStore(sqlite)
  store.createMessage({
    id: 'message-1',
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Hello',
    createdAt: 1,
  })
  store.createMessage({
    id: 'message-2',
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-2', name: 'Bob' },
    text: 'Hi',
    createdAt: 2,
  })
  expect(store.latestMessageFromOther(GENERAL_ROOM_ID, 'user-2')).toEqual({
    id: 'message-1',
    createdAt: 1,
    authorId: 'user-1',
  })
  const attention = {
    id: 'attention-1',
    roomId: GENERAL_ROOM_ID,
    recipientId: 'user-2',
    kind: 'mention' as const,
    sourceId: 'message-1',
    createdAt: 1,
  }

  expect(store.createAttention(attention)).toBe(true)
  expect(
    store.createAttention({ ...attention, id: 'attention-duplicate' }),
  ).toBe(false)
  expect(store.listMentionRecipientIds('message-1')).toEqual(['user-2'])
  expect(store.listAttentionCounts('user-2').get(GENERAL_ROOM_ID)).toBe(1)
  expect(
    store.listAttentionCounts('user-2', 'mention').get(GENERAL_ROOM_ID),
  ).toBe(1)

  store.acknowledgeRoomAttention(GENERAL_ROOM_ID, 'user-2', 2)
  expect(store.listAttentionCounts('user-2').size).toBe(0)
  expect(store.listMentionRecipientIds('message-1')).toEqual(['user-2'])

  sqlite.close()
})
