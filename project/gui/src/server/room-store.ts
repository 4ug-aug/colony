import type { RunState } from '../../../runs'
import type { RunSummary } from './run-control'

export const GENERAL_ROOM_ID = 'general' as const

export type RoomUser = { id: string; name: string; image?: string }
export type MessageAuthor =
  | ({ kind: 'user' } & RoomUser)
  | { kind: 'agent'; id: string; name: string; image?: string }
export type RoomSummary = { id: string; name: string }
export type RoomMessage = {
  id: string
  roomId: string
  author: MessageAuthor
  text: string
  createdAt: number
}

const AGENT_PARTICIPANTS: Record<string, { id: string; name: string; image?: string }> = {
  'software-engineer': { id: 'software-engineer', name: 'Software engineer' },
}
export function agentParticipant(definitionId: string): { id: string; name: string; image?: string } {
  return AGENT_PARTICIPANTS[definitionId] ?? { id: definitionId, name: definitionId }
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
  createRoom(room: RoomSummary): boolean
  listMessages(roomId: string): RoomMessage[]
  listRuns(roomId: string): RoomRun[]
  createMessage(message: RoomMessage): void
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
type MessageRow = {
  id: string
  room_id: string
  author_id: string
  author_name: string
  author_image: string | null
  author_kind: string
  text: string
  created_at: number
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

const messageFrom = (row: MessageRow): RoomMessage => ({
  id: row.id,
  roomId: row.room_id,
  author: row.author_kind === 'agent'
    ? { kind: 'agent', id: row.author_id, name: row.author_name, ...(row.author_image ? { image: row.author_image } : {}) }
    : { kind: 'user', id: row.author_id, name: row.author_name, ...(row.author_image ? { image: row.author_image } : {}) },
  text: row.text,
  createdAt: row.created_at,
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

export function createSqliteRoomStore(sqlite: Sqlite): RoomStore {
  const messages = (roomId: string): RoomMessage[] =>
    (
      sqlite
        .prepare(
          'SELECT id, room_id, author_id, author_name, author_image, author_kind, text, created_at FROM room_message WHERE room_id = ? ORDER BY created_at, id',
        )
        .all(roomId) as MessageRow[]
    ).map(messageFrom)
  const selectRuns = (where = '', ...values: unknown[]): RoomRun[] =>
    (
      sqlite
        .prepare(
          `SELECT id, room_id, requested_by_id AS author_id, requested_by_name AS author_name, requested_by_image AS author_image, task, agent_id, state, created_at, started_at, completed_at, exit_code, error, stdout, stderr, trigger_message_id FROM room_run ${where} ORDER BY created_at, id`,
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
    run.state,
    run.createdAt,
    run.startedAt ?? null,
    run.completedAt ?? null,
    run.exitCode ?? null,
    run.error ?? null,
    run.stdout,
    run.stderr,
  ]
  return {
    listRooms: () =>
      sqlite
        .prepare(
          "SELECT id, name FROM room ORDER BY CASE WHEN id = 'general' THEN 0 ELSE 1 END, name COLLATE NOCASE, id",
        )
        .all() as RoomSummary[],
    getRoom: (roomId) =>
      sqlite.prepare('SELECT id, name FROM room WHERE id = ?').get(roomId) as
        RoomSummary | undefined,
    createRoom: (room) => {
      const result = sqlite
        .prepare('INSERT OR IGNORE INTO room (id, name) VALUES (?, ?)')
        .run(room.id, room.name) as { changes?: number }
      return result.changes === 1
    },
    listMessages: messages,
    listRuns: (roomId) => selectRuns('WHERE room_id = ?', roomId),
    createMessage: (message) => {
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
    },
    createRun: (run) => {
      sqlite
        .prepare(
          'INSERT INTO room_run (id, room_id, trigger_message_id, requested_by_id, requested_by_name, requested_by_image, task, agent_id, state, created_at, started_at, completed_at, exit_code, error, stdout, stderr) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
          .prepare('SELECT id, run_id, room_id, idx, kind, tool, call_id, text, created_at FROM run_step WHERE run_id = ? ORDER BY idx')
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
