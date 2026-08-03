import type { RunState } from '../../../runs'
import type { RunSummary } from './run-control'

export const GENERAL_ROOM_ID = 'general' as const

export type RoomUser = {
  id: string
  name: string
  image?: string
  email?: string
  displayName?: string
  username?: string
  role?: string
  banned?: boolean | null
}
export type MessageAuthor =
  | ({ kind: 'user' } & RoomUser)
  | { kind: 'agent'; id: string; name: string; image?: string }
export type RoomSummary = {
  id: string
  name: string
  visibility: 'public' | 'private'
  createdBy?: string
}
export type RoomMessage = {
  id: string
  roomId: string
  author: MessageAuthor
  text: string
  createdAt: number
  attachments: RoomAttachment[]
}
export type RoomMessageMarker = {
  id: string
  createdAt: number
  authorId: string
}
export type RoomAttachment = {
  id: string
  filename: string
  contentType: string
  byteSize: number
}
export type NewRoomAttachment = RoomAttachment & {
  sha256: string
  storageKey: string
  createdAt: number
}
export type StoredRoomAttachment = NewRoomAttachment & { roomId: string }
export type RoomMessageInput = Omit<RoomMessage, 'attachments'> & {
  attachments?: RoomAttachment[]
}
export type RoomHistoryPage = {
  messages: RoomMessage[]
  runs: RoomRun[]
  nextCursor?: string
}
export type AttentionKind = 'mention' | 'run_terminal'
export type RoomAttention = {
  id: string
  roomId: string
  recipientId: string
  kind: AttentionKind
  sourceId: string
  createdAt: number
}

const AGENT_PARTICIPANTS: Record<
  string,
  { id: string; name: string; image?: string }
> = {
  'software-engineer': { id: 'software-engineer', name: 'Software engineer' },
  antboy: { id: 'antboy', name: 'antboy' },
}
export function agentParticipant(definitionId: string): {
  id: string
  name: string
  image?: string
} {
  return (
    AGENT_PARTICIPANTS[definitionId] ?? { id: definitionId, name: definitionId }
  )
}
export type RoomRun = RunSummary & {
  roomId: string
  triggerMessageId: string
  requestedBy: RoomUser
}

export type StoredStep = {
  id: string
  runId: string
  roomId: string
  idx: number
  kind: 'message' | 'tool_call' | 'tool_result'
  tool?: string
  callId?: string
  text: string
  createdAt: number
}

export interface RoomStore {
  listRooms(): RoomSummary[]
  getRoom(roomId: string): RoomSummary | undefined
  createRoom(room: {
    id: string
    name: string
    visibility: 'public' | 'private'
    createdBy?: string
  }): boolean
  deleteRoom(roomId: string): boolean
  listAttachmentStorageKeys(roomId: string): string[]
  getAttachment(id: string): StoredRoomAttachment | undefined
  canAccessRoom(roomId: string, userId: string): boolean
  listRoomsForUser(userId: string): RoomSummary[]
  listMembers(roomId: string): RoomUser[]
  isOwner(roomId: string, userId: string): boolean
  addMember(roomId: string, userId: string, addedBy: string): void
  removeMember(roomId: string, userId: string): void
  listWorkspaceUsers(): RoomUser[]
  listMentionableAccounts(roomId: string): RoomUser[]
  listMessages(roomId: string): RoomMessage[]
  latestMessageFromOther(
    roomId: string,
    userId: string,
  ): RoomMessageMarker | undefined
  listRoomHistoryPage(
    roomId: string,
    options: { limit: number; cursor?: string },
  ): RoomHistoryPage
  listRuns(roomId: string): RoomRun[]
  createMessage(
    message: RoomMessageInput,
    attachments?: NewRoomAttachment[],
  ): void
  createAttention(attention: RoomAttention): boolean
  listMentionRecipientIds(messageId: string): string[]
  listAttentionCounts(userId: string, kind?: AttentionKind): Map<string, number>
  acknowledgeRoomAttention(roomId: string, userId: string, at: number): void
  createRun(run: RoomRun): void
  updateRun(run: RoomRun): void
  failStaleRuns(): RoomRun[]
  getRun(id: string): RoomRun | undefined
  appendStep(step: StoredStep): void
  listSteps(runId: string): StoredStep[]
  latestStepsForActiveRuns(roomId: string): Map<string, StoredStep>
}

type Statement = {
  all(...values: unknown[]): unknown[]
  get(...values: unknown[]): unknown
  run(...values: unknown[]): unknown
}
type Sqlite = { prepare(sql: string): Statement }
type RoomRow = {
  id: string
  name: string
  visibility: 'public' | 'private'
  created_by: string | null
}
type UserRow = {
  id: string
  name: string
  username?: string | null
  image: string | null
  email?: string | null
  display_name?: string | null
}
type MessageRow = {
  id: string
  room_id: string
  author_id: string
  author_name: string
  author_image: string | null
  author_kind: string
  author_email?: string | null
  author_display_name?: string | null
  text: string
  created_at: number
}
type AttachmentRow = {
  id: string
  message_id: string
  filename: string
  content_type: string
  byte_size: number
  sha256: string
  storage_key: string
  created_at: number
  room_id?: string
}
type RunRow = {
  id: string
  room_id: string
  author_id: string
  author_name: string
  author_image: string | null
  created_at: number
  task: string
  agent_id: string
  provider: 'openai' | 'custom' | 'cursor'
  model: string
  state: RunState
  started_at: number | null
  completed_at: number | null
  exit_code: number | null
  error: string | null
  stdout: string
  stderr: string
  trigger_message_id: string
}
type StepRow = {
  id: string
  run_id: string
  room_id: string
  idx: number
  kind: string
  tool: string | null
  call_id: string | null
  text: string
  created_at: number
}

const roomFrom = (row: RoomRow): RoomSummary => ({
  id: row.id,
  name: row.name,
  visibility: row.visibility,
  ...(row.created_by != null ? { createdBy: row.created_by } : {}),
})
const userFrom = (row: UserRow): RoomUser => ({
  id: row.id,
  name: row.name,
  ...(row.username != null ? { username: row.username } : {}),
  ...(row.display_name != null ? { displayName: row.display_name } : {}),
  ...(row.email != null ? { email: row.email } : {}),
  ...(row.image != null ? { image: row.image } : {}),
})
const attachmentFrom = (row: AttachmentRow): RoomAttachment => ({
  id: row.id,
  filename: row.filename,
  contentType: row.content_type,
  byteSize: row.byte_size,
})
const messageFrom = (
  row: MessageRow,
  attachments: RoomAttachment[] = [],
): RoomMessage => ({
  id: row.id,
  roomId: row.room_id,
  author:
    row.author_kind === 'agent'
      ? {
          kind: 'agent',
          id: row.author_id,
          name: row.author_name,
          ...(row.author_image ? { image: row.author_image } : {}),
        }
      : {
          kind: 'user',
          id: row.author_id,
          name: row.author_name,
          ...(row.author_display_name
            ? { displayName: row.author_display_name }
            : {}),
          ...(row.author_email ? { email: row.author_email } : {}),
          ...(row.author_image ? { image: row.author_image } : {}),
        },
  text: row.text,
  createdAt: row.created_at,
  attachments,
})
const stepFrom = (row: StepRow): StoredStep => ({
  id: row.id,
  runId: row.run_id,
  roomId: row.room_id,
  idx: row.idx,
  kind: row.kind as StoredStep['kind'],
  ...(row.tool != null ? { tool: row.tool } : {}),
  ...(row.call_id != null ? { callId: row.call_id } : {}),
  text: row.text,
  createdAt: row.created_at,
})
const runFrom = (row: RunRow): RoomRun => ({
  id: row.id,
  roomId: row.room_id,
  task: row.task,
  agentId: row.agent_id,
  provider: row.provider,
  model: row.model,
  state: row.state,
  createdAt: row.created_at,
  startedAt: row.started_at ?? undefined,
  completedAt: row.completed_at ?? undefined,
  exitCode: row.exit_code ?? undefined,
  error: row.error ?? undefined,
  stdout: row.stdout,
  stderr: row.stderr,
  triggerMessageId: row.trigger_message_id,
  requestedBy: {
    id: row.author_id,
    name: row.author_name,
    ...(row.author_image ? { image: row.author_image } : {}),
  },
})

type MessageCursor = { createdAt: number; id: string }

const encodeMessageCursor = (cursor: MessageCursor): string =>
  Buffer.from(JSON.stringify(cursor)).toString('base64url')

const decodeMessageCursor = (value: string): MessageCursor => {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<MessageCursor>
    if (
      typeof parsed.createdAt !== 'number' ||
      !Number.isFinite(parsed.createdAt) ||
      typeof parsed.id !== 'string' ||
      !parsed.id
    )
      throw new Error()
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    throw new Error('Invalid room history cursor')
  }
}

export function createSqliteRoomStore(sqlite: Sqlite): RoomStore {
  const hasAttachments = Boolean(
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'room_attachment'",
      )
      .get(),
  )
  const userColumns = sqlite.prepare('PRAGMA table_info(user)').all() as {
    name?: string
  }[]
  const hasUsername = userColumns.some((column) => column.name === 'username')
  const hasBanned = userColumns.some((column) => column.name === 'banned')
  const activeUser = hasBanned ? 'AND COALESCE(u.banned, 0) = 0' : ''
  const userName = hasUsername ? 'COALESCE(u.username, u.name)' : 'u.name'
  const userProfile = hasUsername
    ? ', u.username, u.email, u.name AS display_name'
    : ''
  const messageProfile = hasUsername
    ? ', u.email AS author_email, u.name AS author_display_name'
    : ''
  const messageProfileJoin = hasUsername
    ? " LEFT JOIN user u ON m.author_kind = 'user' AND u.id = m.author_id"
    : ''
  const hydrateMessages = (roomId: string, rows: MessageRow[]) => {
    if (!rows.length) return []
    const attachments = hasAttachments
      ? (sqlite
          .prepare(
            `SELECT a.id, a.message_id, a.filename, a.content_type, a.byte_size, a.sha256, a.storage_key, a.created_at
         FROM room_attachment a JOIN room_message m ON m.id = a.message_id
         WHERE m.room_id = ? AND a.message_id IN (${rows.map(() => '?').join(', ')}) ORDER BY a.created_at, a.id`,
          )
          .all(roomId, ...rows.map(({ id }) => id)) as AttachmentRow[])
      : []
    const byMessage = new Map<string, RoomAttachment[]>()
    for (const attachment of attachments) {
      const list = byMessage.get(attachment.message_id) ?? []
      list.push(attachmentFrom(attachment))
      byMessage.set(attachment.message_id, list)
    }
    return rows.map((row) => messageFrom(row, byMessage.get(row.id) ?? []))
  }
  const messages = (roomId: string): RoomMessage[] => {
    const rows = sqlite
      .prepare(
        `SELECT m.id, m.room_id, m.author_id, m.author_name, m.author_image, m.author_kind, m.text, m.created_at${messageProfile}
           FROM room_message m${messageProfileJoin}
           WHERE m.room_id = ? ORDER BY m.created_at, m.id`,
      )
      .all(roomId) as MessageRow[]
    return hydrateMessages(roomId, rows)
  }
  const latestMessageFromOther = (
    roomId: string,
    userId: string,
  ): RoomMessageMarker | undefined => {
    const row = sqlite
      .prepare(
        `SELECT id, created_at, author_id
         FROM room_message
         WHERE room_id = ? AND author_id <> ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      )
      .get(roomId, userId) as
      { id: string; created_at: number; author_id: string } | undefined
    return row
      ? { id: row.id, createdAt: row.created_at, authorId: row.author_id }
      : undefined
  }
  const messageRows = (
    roomId: string,
    before: MessageCursor | undefined,
    limit: number,
  ): MessageRow[] => {
    const where = before
      ? 'WHERE m.room_id = ? AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))'
      : 'WHERE m.room_id = ?'
    const values = before
      ? [roomId, before.createdAt, before.createdAt, before.id, limit + 1]
      : [roomId, limit + 1]
    return sqlite
      .prepare(
        `SELECT m.id, m.room_id, m.author_id, m.author_name, m.author_image, m.author_kind, m.text, m.created_at${messageProfile}
           FROM room_message m${messageProfileJoin}
           ${where} ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
      )
      .all(...values) as MessageRow[]
  }
  const selectRuns = (where = '', ...values: unknown[]): RoomRun[] =>
    (
      sqlite
        .prepare(
          `SELECT id, room_id, requested_by_id AS author_id, requested_by_name AS author_name, requested_by_image AS author_image, task, agent_id, provider, model, state, created_at, started_at, completed_at, exit_code, error, stdout, stderr, trigger_message_id FROM room_run ${where} ORDER BY created_at, id`,
        )
        .all(...values) as RunRow[]
    ).map(runFrom)
  const values = (run: RoomRun) => [
    run.id,
    run.roomId,
    run.triggerMessageId,
    run.requestedBy.id,
    run.requestedBy.name,
    run.requestedBy.image ?? null,
    run.task,
    run.agentId,
    run.provider,
    run.model,
    run.state,
    run.createdAt,
    run.startedAt ?? null,
    run.completedAt ?? null,
    run.exitCode ?? null,
    run.error ?? null,
    run.stdout,
    run.stderr,
  ]
  const ROOM_ORDER =
    "ORDER BY CASE WHEN id = 'general' THEN 0 ELSE 1 END, name COLLATE NOCASE, id"
  const listRoomHistoryPage = (
    roomId: string,
    options: { limit: number; cursor?: string },
  ): RoomHistoryPage => {
    const limit = Math.max(1, Math.min(100, Math.floor(options.limit)))
    const before =
      options.cursor !== undefined
        ? decodeMessageCursor(options.cursor)
        : undefined
    const rows = messageRows(roomId, before, limit)
    const pageRows = rows.slice(0, limit)
    const messages = hydrateMessages(roomId, [...pageRows].reverse())
    const messageIds = pageRows.map(({ id }) => id)
    const runWhere = messageIds.length
      ? `WHERE room_id = ? AND (trigger_message_id IN (${messageIds.map(() => '?').join(', ')}) OR state IN ('preparing', 'running'))`
      : "WHERE room_id = ? AND state IN ('preparing', 'running')"
    const runs = selectRuns(runWhere, roomId, ...messageIds)
    return {
      messages,
      runs,
      ...(rows.length > limit && pageRows.length
        ? {
            nextCursor: encodeMessageCursor({
              createdAt: pageRows.at(-1)!.created_at,
              id: pageRows.at(-1)!.id,
            }),
          }
        : {}),
    }
  }
  return {
    listRooms: () =>
      (
        sqlite
          .prepare(
            `SELECT id, name, visibility, created_by FROM room ${ROOM_ORDER}`,
          )
          .all() as RoomRow[]
      ).map(roomFrom),
    getRoom: (roomId) => {
      const row = sqlite
        .prepare(
          'SELECT id, name, visibility, created_by FROM room WHERE id = ?',
        )
        .get(roomId) as RoomRow | undefined
      return row ? roomFrom(row) : undefined
    },
    createRoom: (room) => {
      const result = sqlite
        .prepare(
          'INSERT OR IGNORE INTO room (id, name, visibility, created_by) VALUES (?, ?, ?, ?)',
        )
        .run(room.id, room.name, room.visibility, room.createdBy ?? null) as {
        changes?: number
      }
      const inserted = result.changes === 1
      if (inserted && room.visibility === 'private' && room.createdBy != null) {
        sqlite
          .prepare(
            'INSERT OR IGNORE INTO room_member (room_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)',
          )
          .run(room.id, room.createdBy, room.createdBy, Date.now())
      }
      return inserted
    },
    deleteRoom: (roomId) =>
      ((
        sqlite.prepare('DELETE FROM room WHERE id = ?').run(roomId) as {
          changes?: number
        }
      ).changes ?? 0) > 0,
    listAttachmentStorageKeys: (roomId) =>
      (
        sqlite
          .prepare(
            `SELECT a.storage_key FROM room_attachment a
             JOIN room_message m ON m.id = a.message_id WHERE m.room_id = ?`,
          )
          .all(roomId) as { storage_key: string }[]
      ).map(({ storage_key }) => storage_key),
    getAttachment: (id) => {
      const row = sqlite
        .prepare(
          `SELECT a.id, a.message_id, a.filename, a.content_type, a.byte_size, a.sha256, a.storage_key, a.created_at, m.room_id
           FROM room_attachment a JOIN room_message m ON m.id = a.message_id WHERE a.id = ?`,
        )
        .get(id) as AttachmentRow | undefined
      return row && row.room_id
        ? {
            ...attachmentFrom(row),
            sha256: row.sha256,
            storageKey: row.storage_key,
            createdAt: row.created_at,
            roomId: row.room_id,
          }
        : undefined
    },
    canAccessRoom: (roomId, userId) => {
      const row = sqlite
        .prepare(
          `SELECT CASE
            WHEN r.id IS NULL THEN 0
            WHEN r.visibility = 'public' THEN 1
            WHEN m.user_id IS NOT NULL THEN 1
            ELSE 0
          END AS can_access
          FROM (SELECT NULL) AS dummy
          LEFT JOIN room r ON r.id = ?
          LEFT JOIN room_member m ON m.room_id = ? AND m.user_id = ?`,
        )
        .get(roomId, roomId, userId) as { can_access: number } | undefined
      return (row?.can_access ?? 0) === 1
    },
    listRoomsForUser: (userId) =>
      (
        sqlite
          .prepare(
            `SELECT id, name, visibility, created_by FROM room
           WHERE visibility = 'public'
              OR id IN (SELECT room_id FROM room_member WHERE user_id = ?)
           ${ROOM_ORDER}`,
          )
          .all(userId) as RoomRow[]
      ).map(roomFrom),
    listMembers: (roomId) =>
      (
        sqlite
          .prepare(
            `SELECT u.id, ${userName} AS name, u.image${userProfile} FROM room_member rm
           JOIN user u ON u.id = rm.user_id
           WHERE rm.room_id = ?
           ORDER BY u.name COLLATE NOCASE, u.id`,
          )
          .all(roomId) as UserRow[]
      ).map(userFrom),
    isOwner: (roomId, userId) => {
      const row = sqlite
        .prepare('SELECT created_by FROM room WHERE id = ?')
        .get(roomId) as { created_by: string | null } | undefined
      return row?.created_by === userId
    },
    addMember: (roomId, userId, addedBy) => {
      sqlite
        .prepare(
          'INSERT OR IGNORE INTO room_member (room_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)',
        )
        .run(roomId, userId, addedBy, Date.now())
    },
    removeMember: (roomId, userId) => {
      sqlite
        .prepare('DELETE FROM room_member WHERE room_id = ? AND user_id = ?')
        .run(roomId, userId)
      sqlite
        .prepare(
          'DELETE FROM room_attention WHERE room_id = ? AND recipient_id = ?',
        )
        .run(roomId, userId)
    },
    listWorkspaceUsers: () =>
      (
        sqlite
          .prepare(
            `SELECT u.id, ${userName} AS name, u.image${userProfile} FROM user u ORDER BY ${userName} COLLATE NOCASE, u.id`,
          )
          .all() as UserRow[]
      ).map(userFrom),
    listMentionableAccounts: (roomId) =>
      (
        sqlite
          .prepare(
            `SELECT u.id, ${userName} AS name, u.image${userProfile}
             FROM user u
             JOIN room r ON r.id = ?
             LEFT JOIN room_member rm ON rm.room_id = r.id AND rm.user_id = u.id
             WHERE (r.visibility = 'public' OR rm.user_id IS NOT NULL)
               ${activeUser}
             ORDER BY ${userName} COLLATE NOCASE, u.id`,
          )
          .all(roomId) as UserRow[]
      ).map(userFrom),
    listMessages: messages,
    latestMessageFromOther,
    listRoomHistoryPage,
    listRuns: (roomId) => selectRuns('WHERE room_id = ?', roomId),
    createMessage: (message, attachments = []) => {
      const run = () => {
        sqlite
          .prepare(
            'INSERT INTO room_message (id, room_id, author_id, author_name, author_image, author_kind, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            message.id,
            message.roomId,
            message.author.id,
            message.author.name,
            message.author.image ?? null,
            message.author.kind,
            message.text,
            message.createdAt,
          )
        if (!attachments.length) return
        const insert = sqlite.prepare(
          'INSERT INTO room_attachment (id, message_id, filename, content_type, byte_size, sha256, storage_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        for (const attachment of attachments)
          insert.run(
            attachment.id,
            message.id,
            attachment.filename,
            attachment.contentType,
            attachment.byteSize,
            attachment.sha256,
            attachment.storageKey,
            attachment.createdAt,
          )
      }
      if (!attachments.length) return run()
      // SQLite transactions keep message and attachment rows inseparable.
      sqlite.prepare('BEGIN').run()
      try {
        run()
        sqlite.prepare('COMMIT').run()
      } catch (error) {
        sqlite.prepare('ROLLBACK').run()
        throw error
      }
    },
    createAttention: (attention) =>
      ((
        sqlite
          .prepare(
            'INSERT OR IGNORE INTO room_attention (id, room_id, recipient_id, kind, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(
            attention.id,
            attention.roomId,
            attention.recipientId,
            attention.kind,
            attention.sourceId,
            attention.createdAt,
          ) as { changes?: number }
      ).changes ?? 0) === 1,
    listMentionRecipientIds: (messageId) =>
      (
        sqlite
          .prepare(
            "SELECT recipient_id FROM room_attention WHERE kind = 'mention' AND source_id = ? ORDER BY recipient_id",
          )
          .all(messageId) as { recipient_id: string }[]
      ).map(({ recipient_id }) => recipient_id),
    listAttentionCounts: (userId, kind) => {
      const kindFilter = kind ? ' AND a.kind = ?' : ''
      const rows = sqlite
        .prepare(
          `SELECT a.room_id, COUNT(*) AS count
           FROM room_attention a
           JOIN room r ON r.id = a.room_id
           LEFT JOIN room_member rm
             ON rm.room_id = r.id AND rm.user_id = a.recipient_id
           WHERE a.recipient_id = ?
             AND a.acknowledged_at IS NULL
             AND (r.visibility = 'public' OR rm.user_id IS NOT NULL)
             ${kindFilter}
           GROUP BY a.room_id`,
        )
        .all(...(kind ? [userId, kind] : [userId])) as {
        room_id: string
        count: number
      }[]
      return new Map(rows.map(({ room_id, count }) => [room_id, count]))
    },
    acknowledgeRoomAttention: (roomId, userId, at) => {
      sqlite
        .prepare(
          'UPDATE room_attention SET acknowledged_at = ? WHERE room_id = ? AND recipient_id = ? AND acknowledged_at IS NULL',
        )
        .run(at, roomId, userId)
    },
    createRun: (run) => {
      sqlite
        .prepare(
          'INSERT INTO room_run (id, room_id, trigger_message_id, requested_by_id, requested_by_name, requested_by_image, task, agent_id, provider, model, state, created_at, started_at, completed_at, exit_code, error, stdout, stderr) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(...values(run))
    },
    updateRun: (run) => {
      sqlite
        .prepare(
          'UPDATE room_run SET task = ?, agent_id = ?, state = ?, started_at = ?, completed_at = ?, exit_code = ?, error = ?, stdout = ?, stderr = ? WHERE id = ? AND room_id = ?',
        )
        .run(
          run.task,
          run.agentId,
          run.state,
          run.startedAt ?? null,
          run.completedAt ?? null,
          run.exitCode ?? null,
          run.error ?? null,
          run.stdout,
          run.stderr,
          run.id,
          run.roomId,
        )
    },
    failStaleRuns: () => {
      sqlite
        .prepare(
          "UPDATE room_run SET state = 'failed', error = 'Server restarted before the run completed.', completed_at = ? WHERE state IN ('preparing', 'running')",
        )
        .run(Date.now())
      return selectRuns(
        "WHERE state = 'failed' AND error = 'Server restarted before the run completed.'",
      )
    },
    getRun: (id) => selectRuns('WHERE id = ?', id).at(0),
    appendStep: (step) => {
      sqlite
        .prepare(
          'INSERT INTO run_step (id, run_id, room_id, idx, kind, tool, call_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          step.id,
          step.runId,
          step.roomId,
          step.idx,
          step.kind,
          step.tool ?? null,
          step.callId ?? null,
          step.text,
          step.createdAt,
        )
    },
    listSteps: (runId) =>
      (
        sqlite
          .prepare(
            'SELECT id, run_id, room_id, idx, kind, tool, call_id, text, created_at FROM run_step WHERE run_id = ? ORDER BY idx',
          )
          .all(runId) as StepRow[]
      ).map(stepFrom),
    latestStepsForActiveRuns: (roomId) => {
      const rows = sqlite
        .prepare(
          `SELECT s.id, s.run_id, s.room_id, s.idx, s.kind, s.tool, s.call_id, s.text, s.created_at
           FROM run_step s
           JOIN room_run r ON r.id = s.run_id
           WHERE r.room_id = ? AND r.state IN ('preparing', 'running')
             AND s.idx = (SELECT MAX(s2.idx) FROM run_step s2 WHERE s2.run_id = s.run_id)`,
        )
        .all(roomId) as StepRow[]
      const map = new Map<string, StoredStep>()
      for (const row of rows) map.set(row.run_id, stepFrom(row))
      return map
    },
  }
}
