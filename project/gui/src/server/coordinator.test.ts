import { expect, test } from 'bun:test'
import { createServer } from 'node:net'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  allowedOrigin,
  createCoordinator,
  mintRealtimeTicket,
  parseSandboxProvider,
  verifyRealtimeTicket,
  type SessionAuthenticator,
} from './coordinator'
import {
  createRunControl,
  type RunControl,
  type RunSummary,
  type Step,
} from './run-control'
import type { AttachmentInput } from '../../../inputs/repository'
import { createWorkspaceAgentsExecutor } from '../../../agents/roster'
import { createAppleContainerClient } from '../../../sdk/src'
import { createAppleContainerSandboxProvider } from '../../../providers/apple-container-sandbox'
import {
  GENERAL_ROOM_ID,
  type RoomMessage,
  type RoomAttention,
  type NewRoomAttachment,
  type RoomMessageInput,
  type StoredRoomAttachment,
  type RoomRun,
  type RoomSummary,
  type RoomStore,
  type RoomUser,
  type StoredStep,
} from './room-store'
import { createRoomMessageHub } from './room-hub'
import { createRoomAttachmentSource } from './attachments'

class FakeRunControl implements RunControl {
  private listeners = new Set<(run: RunSummary) => void>()
  private stepListeners = new Set<(runId: string, step: Step) => void>()
  private runs: RunSummary[] = []
  requests: Array<{
    task: string
    roomId: string
    agentDefinitionId?: string
    attachments?: readonly AttachmentInput[]
  }> = []
  stops = 0
  listRuns() {
    return this.runs
  }
  getRun(id: string) {
    return this.runs.find((run) => run.id === id)
  }
  subscribe(listener: (run: RunSummary) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  subscribeSteps(listener: (runId: string, step: Step) => void) {
    this.stepListeners.add(listener)
    return () => this.stepListeners.delete(listener)
  }
  start<Output>(
    task: string,
    context: {
      roomId: string
      agentDefinitionId?: string
      attachments?: readonly AttachmentInput[]
      onCreate: (run: RunSummary) => Output
    },
  ): Output {
    const agentId = context.agentDefinitionId ?? 'software-engineer'
    const run: RunSummary = {
      id: crypto.randomUUID(),
      task,
      agentId,
      provider: agentId === 'software-engineer' ? 'cursor' : 'openai',
      model: agentId === 'software-engineer' ? 'composer-2.5' : 'gpt-4.1-mini',
      state: 'preparing',
      createdAt: Date.now(),
      stdout: '',
      stderr: '',
    }
    this.requests.push({
      task,
      roomId: context.roomId,
      ...(context.agentDefinitionId
        ? { agentDefinitionId: context.agentDefinitionId }
        : {}),
      ...(context.attachments ? { attachments: context.attachments } : {}),
    })
    const created = context.onCreate(run)
    this.runs = [...this.runs, run]
    this.publish(run)
    return created
  }
  async cancel(id: string) {
    const run = this.runs.find((item) => item.id === id)
    if (!run) return undefined
    const changed = {
      ...run,
      state: 'cancelled' as const,
      completedAt: Date.now(),
    }
    this.runs = this.runs.map((item) => (item.id === id ? changed : item))
    this.publish(changed)
    return changed
  }
  async followUp(_runId: string, _task: string) {
    return undefined
  }
  async stop() {
    this.stops++
  }
  emitStep(runId: string, step: Step) {
    for (const listener of this.stepListeners) listener(runId, step)
  }
  finish(id: string, state: 'succeeded' | 'failed') {
    const run = this.runs.find((item) => item.id === id)
    if (!run) throw new Error('run not found')
    const changed = { ...run, state, completedAt: Date.now() }
    this.runs = this.runs.map((item) => (item.id === id ? changed : item))
    this.publish(changed)
  }
  private publish(run: RunSummary) {
    for (const listener of this.listeners) listener(run)
  }
}
type MemberRow = {
  roomId: string
  userId: string
  addedBy: string
  addedAt: number
}
class MemoryRoomStore implements RoomStore {
  rooms: RoomSummary[] = [
    { id: GENERAL_ROOM_ID, name: 'General', visibility: 'public' },
  ]
  messages: RoomMessage[] = []
  runs: RoomRun[] = []
  steps: StoredStep[] = []
  attentions: (RoomAttention & { acknowledgedAt?: number })[] = []
  members: MemberRow[] = []
  workspaceUsers: RoomUser[] = []
  attachments: StoredRoomAttachment[] = []
  listRooms() {
    return this.rooms
  }
  getRoom(id: string) {
    return this.rooms.find((room) => room.id === id)
  }
  createRoom(room: {
    id: string
    name: string
    visibility: 'public' | 'private'
    createdBy?: string
  }) {
    if (
      this.rooms.some(
        (item) => item.name.toLowerCase() === room.name.toLowerCase(),
      )
    )
      return false
    this.rooms.push({
      id: room.id,
      name: room.name,
      visibility: room.visibility,
      ...(room.createdBy ? { createdBy: room.createdBy } : {}),
    })
    if (room.visibility === 'private' && room.createdBy) {
      this.members.push({
        roomId: room.id,
        userId: room.createdBy,
        addedBy: room.createdBy,
        addedAt: Date.now(),
      })
    }
    return true
  }
  deleteRoom(roomId: string) {
    const exists = this.rooms.some((room) => room.id === roomId)
    this.rooms = this.rooms.filter((room) => room.id !== roomId)
    this.members = this.members.filter((member) => member.roomId !== roomId)
    this.attentions = this.attentions.filter(
      (attention) => attention.roomId !== roomId,
    )
    this.attachments = this.attachments.filter(
      (attachment) => attachment.roomId !== roomId,
    )
    return exists
  }
  listAttachmentStorageKeys(roomId: string) {
    return this.attachments
      .filter((attachment) => attachment.roomId === roomId)
      .map((attachment) => attachment.storageKey)
  }
  getAttachment(id: string) {
    return this.attachments.find((attachment) => attachment.id === id)
  }
  canAccessRoom(roomId: string, userId: string): boolean {
    const room = this.rooms.find((r) => r.id === roomId)
    if (!room) return false
    if (room.visibility === 'public') return true
    return this.members.some((m) => m.roomId === roomId && m.userId === userId)
  }
  listRoomsForUser(userId: string): RoomSummary[] {
    return this.rooms.filter(
      (r) =>
        r.visibility === 'public' ||
        this.members.some((m) => m.roomId === r.id && m.userId === userId),
    )
  }
  listMembers(roomId: string): RoomUser[] {
    return this.members
      .filter((m) => m.roomId === roomId)
      .map((m) => ({ id: m.userId, name: m.userId }))
  }
  isOwner(roomId: string, userId: string): boolean {
    const room = this.rooms.find((r) => r.id === roomId)
    return room?.createdBy === userId
  }
  addMember(roomId: string, userId: string, addedBy: string): void {
    if (!this.members.some((m) => m.roomId === roomId && m.userId === userId))
      this.members.push({ roomId, userId, addedBy, addedAt: Date.now() })
  }
  removeMember(roomId: string, userId: string): void {
    this.members = this.members.filter(
      (m) => !(m.roomId === roomId && m.userId === userId),
    )
    this.attentions = this.attentions.filter(
      (attention) =>
        attention.roomId !== roomId || attention.recipientId !== userId,
    )
  }
  listWorkspaceUsers() {
    return this.workspaceUsers
  }
  listMentionableAccounts(roomId: string) {
    const room = this.getRoom(roomId)
    if (!room) return []
    return this.workspaceUsers.filter(
      (user) =>
        !user.banned &&
        (room.visibility === 'public' ||
          this.members.some(
            (member) => member.roomId === roomId && member.userId === user.id,
          )),
    )
  }
  listMessages(roomId: string) {
    return this.messages.filter((message) => message.roomId === roomId)
  }
  latestMessageFromOther(roomId: string, userId: string) {
    const message = this.listMessages(roomId)
      .filter((message) => message.author.id !== userId)
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
      .at(0)
    return message
      ? {
          id: message.id,
          createdAt: message.createdAt,
          authorId: message.author.id,
        }
      : undefined
  }
  listRoomHistoryPage(
    roomId: string,
    options: { limit: number; cursor?: string },
  ) {
    const before = options.cursor
      ? (JSON.parse(
          Buffer.from(options.cursor, 'base64url').toString('utf8'),
        ) as { createdAt: number; id: string })
      : undefined
    const sorted = this.listMessages(roomId)
      .filter(
        (message) =>
          !before ||
          message.createdAt < before.createdAt ||
          (message.createdAt === before.createdAt && message.id < before.id),
      )
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
    const rows = sorted.slice(0, options.limit)
    const ids = new Set(rows.map(({ id }) => id))
    const runs = this.listRuns(roomId).filter(
      (run) =>
        ids.has(run.triggerMessageId) ||
        ['preparing', 'running'].includes(run.state),
    )
    return {
      messages: rows.reverse(),
      runs: runs.sort(
        (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
      ),
      ...(sorted.length > options.limit && rows.length
        ? {
            nextCursor: Buffer.from(
              JSON.stringify({
                createdAt: rows[0]!.createdAt,
                id: rows[0]!.id,
              }),
            ).toString('base64url'),
          }
        : {}),
    }
  }
  listRoomHistoryAround(
    roomId: string,
    options: { messageId: string; limit: number },
  ) {
    const messages = this.listMessages(roomId).sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    )
    const index = messages.findIndex((message) => message.id === options.messageId)
    if (index < 0) throw new Error('Message not found')
    const limit = Math.max(1, Math.min(100, Math.floor(options.limit)))
    let start = Math.max(0, index - Math.floor((limit - 1) / 2))
    let end = Math.min(messages.length, start + limit)
    start = Math.max(0, end - limit)
    const page = messages.slice(start, end)
    const ids = new Set(page.map(({ id }) => id))
    const runs = this.listRuns(roomId).filter(
      (run) =>
        ids.has(run.triggerMessageId) ||
        ['preparing', 'running'].includes(run.state),
    )
    const oldest = page[0]
    return {
      messages: page,
      runs: runs.sort(
        (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
      ),
      ...(start > 0 && oldest
        ? {
            nextCursor: Buffer.from(
              JSON.stringify({
                createdAt: oldest.createdAt,
                id: oldest.id,
              }),
            ).toString('base64url'),
          }
        : {}),
    }
  }
  searchMessages(input: { userId: string; query: string; limit?: number }) {
    const query = input.query.trim().toLowerCase()
    if (query.length < 2) return []
    const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 20)))
    const accessible = new Set(
      this.listRoomsForUser(input.userId).map((room) => room.id),
    )
    return this.messages
      .filter(
        (message) =>
          accessible.has(message.roomId) &&
          message.text.toLowerCase().includes(query),
      )
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
      .slice(0, limit)
      .map((message) => ({
        messageId: message.id,
        roomId: message.roomId,
        roomName: this.getRoom(message.roomId)?.name ?? message.roomId,
        author: message.author,
        text: message.text,
        createdAt: message.createdAt,
      }))
  }
  listRuns(roomId: string) {
    return this.runs.filter((run) => run.roomId === roomId)
  }
  createMessage(
    message: RoomMessageInput,
    attachments: NewRoomAttachment[] = [],
  ) {
    this.messages.push({ ...message, attachments: message.attachments ?? [] })
    this.attachments.push(
      ...attachments.map((attachment) => ({
        ...attachment,
        roomId: message.roomId,
      })),
    )
  }
  getMessage(roomId: string, messageId: string) {
    return this.messages.find(
      (message) => message.roomId === roomId && message.id === messageId,
    )
  }
  updateMessageText(input: {
    id: string
    roomId: string
    text: string
    editedAt: number
  }) {
    const index = this.messages.findIndex(
      (message) => message.roomId === input.roomId && message.id === input.id,
    )
    if (index < 0) return undefined
    const current = this.messages[index]!
    const updated = {
      ...current,
      text: input.text,
      editedAt: input.editedAt,
    }
    this.messages[index] = updated
    return updated
  }
  createAttention(attention: RoomAttention) {
    if (
      this.attentions.some(
        (item) =>
          item.recipientId === attention.recipientId &&
          item.kind === attention.kind &&
          item.sourceId === attention.sourceId,
      )
    )
      return false
    this.attentions.push(attention)
    return true
  }
  listMentionRecipientIds(messageId: string) {
    return this.attentions
      .filter(
        (attention) =>
          attention.kind === 'mention' && attention.sourceId === messageId,
      )
      .map(({ recipientId }) => recipientId)
      .sort()
  }
  listAttentionCounts(userId: string, kind?: RoomAttention['kind']) {
    const counts = new Map<string, number>()
    for (const attention of this.attentions) {
      if (
        attention.recipientId !== userId ||
        (kind !== undefined && attention.kind !== kind) ||
        attention.acknowledgedAt !== undefined ||
        !this.canAccessRoom(attention.roomId, userId)
      )
        continue
      counts.set(attention.roomId, (counts.get(attention.roomId) ?? 0) + 1)
    }
    return counts
  }
  acknowledgeRoomAttention(roomId: string, userId: string, at: number) {
    this.attentions = this.attentions.map((attention) =>
      attention.roomId === roomId &&
      attention.recipientId === userId &&
      attention.acknowledgedAt === undefined
        ? { ...attention, acknowledgedAt: at }
        : attention,
    )
  }
  createRun(run: RoomRun) {
    this.runs.push(run)
  }
  updateRun(run: RoomRun) {
    this.runs = this.runs.map((item) => (item.id === run.id ? run : item))
  }
  failStaleRuns() {
    return []
  }
  getRun(id: string) {
    return this.runs.find((run) => run.id === id)
  }
  appendStep(step: StoredStep) {
    this.steps.push(step)
  }
  listSteps(runId: string) {
    return this.steps
      .filter((s) => s.runId === runId)
      .sort((a, b) => a.idx - b.idx)
  }
  latestStepsForActiveRuns(roomId: string) {
    const map = new Map<string, StoredStep>()
    const activeRunIds = new Set(
      this.runs
        .filter(
          (r) =>
            r.roomId === roomId &&
            (r.state === 'preparing' || r.state === 'running'),
        )
        .map((r) => r.id),
    )
    for (const step of this.steps) {
      if (!activeRunIds.has(step.runId)) continue
      const existing = map.get(step.runId)
      if (!existing || step.idx > existing.idx) map.set(step.runId, step)
    }
    return map
  }
}
const authorized: SessionAuthenticator = {
  authenticate: async () => ({ id: 'user-1', name: 'Ada' }),
}
const port = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('No port')),
      )
    })
  })
type TestSocket = {
  socket: WebSocket
  next(): Promise<Record<string, unknown>>
}
const expectNoEvent = async (socket: TestSocket): Promise<void> => {
  const received = await Promise.race([
    socket.next().then(() => true),
    Bun.sleep(25).then(() => false),
  ])
  expect(received).toBe(false)
}
const open = (url: string) =>
  new Promise<TestSocket>((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: { origin: 'http://gui.test' },
    } as never)
    const messages: Record<string, unknown>[] = []
    const waiters: ((message: Record<string, unknown>) => void)[] = []
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data) as Record<string, unknown>
      const waiter = waiters.shift()
      if (waiter) waiter(message)
      else messages.push(message)
    })
    socket.onopen = () =>
      resolve({
        socket,
        next: () => {
          const message = messages.shift()
          return message
            ? Promise.resolve(message)
            : new Promise((done) => waiters.push(done))
        },
      })
    socket.onerror = () => reject(new Error('socket failed'))
  })

type CoordinatorOptions = Parameters<typeof createCoordinator>[0]

async function makeCoordinator(
  overrides: Partial<CoordinatorOptions> = {},
) {
  const store = overrides.store ?? new MemoryRoomStore()
  const control = overrides.control ?? new FakeRunControl()
  const messages = overrides.messages ?? createRoomMessageHub(store)
  const coordinator = createCoordinator({
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
    ...overrides,
    control,
    store,
    messages,
  })
  return {
    coordinator,
    store,
    control,
    messages,
    base: `http://localhost:${coordinator.port}`,
  }
}

test('two clients receive durable room messages and agent runs', async () => {
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const { coordinator, base } = await makeCoordinator({ store, control, messages })
  try {
    expect(
      (
        await fetch(`${base}/api/rooms`, {
          headers: { origin: 'http://gui.test' },
        })
      ).status,
    ).toBe(200)
    const a = await open(
      `${base.replace('http', 'ws')}/api/rooms/general/stream`,
    )
    const b = await open(
      `${base.replace('http', 'ws')}/api/rooms/general/stream`,
    )
    expect((await a.next()).type).toBe('room.snapshot')
    expect((await b.next()).type).toBe('room.snapshot')
    const messageA = a.next()
    const messageB = b.next()
    const response = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@software-engineer Fix it' }),
    })
    expect(response.status).toBe(202)
    expect((await messageA).type).toBe('message.created')
    expect((await messageB).type).toBe('message.created')
    const run = ((await response.json()) as { run: RoomRun }).run
    expect(run.task).toBe('Fix it')
    expect(store.messages).toHaveLength(1)
    expect(store.runs).toHaveLength(1)
    expect(await a.next()).toMatchObject({
      type: 'run.changed',
      run: { id: run.id, state: 'preparing' },
    })
    expect(await b.next()).toMatchObject({
      type: 'run.changed',
      run: { id: run.id, state: 'preparing' },
    })
    const changedA = a.next()
    const changedB = b.next()
    const cancelled = await fetch(
      `${base}/api/rooms/general/runs/${run.id}/cancel`,
      { method: 'POST', headers: { origin: 'http://gui.test' } },
    )
    expect(cancelled.status).toBe(200)
    expect(await changedA).toMatchObject({
      type: 'run.changed',
      run: { id: run.id, state: 'cancelled' },
    })
    expect(await changedB).toMatchObject({
      type: 'run.changed',
      run: { id: run.id, state: 'cancelled' },
    })
    const emptyTask = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@software-engineer ' }),
    })
    expect(emptyTask.status).toBe(400)
    expect(store.messages).toHaveLength(1)
    const inline = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Please @software-engineer fix the login' }),
    })
    expect(((await inline.json()) as { run: RoomRun }).run.task).toBe(
      'Please fix the login',
    )
    expect(
      (
        await fetch(`${base}/api/rooms/other/messages`, {
          method: 'POST',
          headers: { origin: 'http://gui.test' },
        })
      ).status,
    ).toBe(404)
    a.socket.close()
    b.socket.close()
  } finally {
    await coordinator.stop()
  }
  await coordinator.stop()
  expect(control.stops).toBe(1)
})

test('agentReady gates software-engineer on Cursor and antboy on LLM', async () => {
  const control = new FakeRunControl()
  const store = new MemoryRoomStore()
  const ready = new Set<string>()
  const coordinator = createCoordinator({
    control,
    store,
    messages: createRoomMessageHub(store),
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
    agentReady: (id = 'software-engineer') => ready.has(id),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    const blockedSe = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@software-engineer Fix it' }),
    })
    expect(blockedSe.status).toBe(409)
    expect(await blockedSe.json()).toEqual({
      error: 'Cursor agent runtime is not configured',
    })

    const blockedAntboy = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@antboy Help with the task' }),
    })
    expect(blockedAntboy.status).toBe(409)
    expect(await blockedAntboy.json()).toEqual({
      error: 'LLM provider is not configured',
    })

    ready.add('antboy')
    const antboy = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@antboy Help with the task' }),
    })
    expect(antboy.status).toBe(202)
    expect(control.requests).toEqual([
      {
        task: 'Help with the task',
        roomId: GENERAL_ROOM_ID,
        agentDefinitionId: 'antboy',
        attachments: [],
      },
    ])
  } finally {
    coordinator.stop()
  }
})

test('room history is paginated over HTTP and in the realtime snapshot', async () => {
  const store = new MemoryRoomStore()
  for (let index = 0; index < 51; index++)
    store.createMessage({
      id: `message-${index}`,
      roomId: GENERAL_ROOM_ID,
      author: { kind: 'user', id: 'user-1', name: 'Ada' },
      text: String(index),
      createdAt: index,
    })
  const { coordinator, base } = await makeCoordinator({ store })
  try {
    const firstResponse = await fetch(`${base}/api/rooms/general/messages`, {
      headers: { origin: 'http://gui.test' },
    })
    const first = (await firstResponse.json()) as {
      messages: RoomMessage[]
      nextCursor?: string
    }
    expect(firstResponse.status).toBe(200)
    expect(first.messages).toHaveLength(50)
    expect(first.messages[0]?.id).toBe('message-1')
    expect(first.messages.at(-1)?.id).toBe('message-50')
    expect(first.nextCursor).toEqual(expect.any(String))

    const secondResponse = await fetch(
      `${base}/api/rooms/general/messages?cursor=${encodeURIComponent(first.nextCursor!)}`,
      { headers: { origin: 'http://gui.test' } },
    )
    const second = (await secondResponse.json()) as {
      messages: RoomMessage[]
      nextCursor?: string
    }
    expect(secondResponse.status).toBe(200)
    expect(second.messages.map(({ id }) => id)).toEqual(['message-0'])
    expect(second.nextCursor).toBeUndefined()

    const invalid = await fetch(
      `${base}/api/rooms/general/messages?cursor=invalid`,
      { headers: { origin: 'http://gui.test' } },
    )
    expect(invalid.status).toBe(400)

    const socket = await open(
      `${base.replace('http', 'ws')}/api/rooms/general/stream`,
    )
    const snapshot = await socket.next()
    expect(snapshot.type).toBe('room.snapshot')
    expect(snapshot.messages).toHaveLength(50)
    expect(snapshot.nextCursor).toEqual(expect.any(String))
    socket.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('message search and around-history are available over HTTP', async () => {
  const store = new MemoryRoomStore()
  store.createRoom({
    id: 'private-1',
    name: 'Private',
    visibility: 'private',
    createdBy: 'user-1',
  })
  store.createMessage({
    id: 'msg-public',
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Deploy the rocket',
    createdAt: 1,
  })
  store.createMessage({
    id: 'msg-private',
    roomId: 'private-1',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Secret rocket',
    createdAt: 2,
  })
  for (const [id, createdAt] of [
    ['msg-a', 10],
    ['msg-b', 11],
    ['msg-c', 12],
  ] as const)
    store.createMessage({
      id,
      roomId: GENERAL_ROOM_ID,
      author: { kind: 'user', id: 'user-1', name: 'Ada' },
      text: id,
      createdAt,
    })

  const coordinator = createCoordinator({
    control: new FakeRunControl(),
    store,
    messages: createRoomMessageHub(store),
    authenticator: {
      authenticate: async () => ({
        id: 'user-2',
        name: 'Bob',
        role: 'member',
      }),
    },
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    const search = await fetch(`${base}/api/search/messages?q=rocket`, {
      headers: { origin: 'http://gui.test' },
    })
    expect(search.status).toBe(200)
    const body = (await search.json()) as {
      hits: { messageId: string; roomName: string }[]
    }
    expect(body.hits.map((hit) => hit.messageId)).toEqual(['msg-public'])

    const around = await fetch(
      `${base}/api/rooms/general/messages?around=msg-b`,
      { headers: { origin: 'http://gui.test' } },
    )
    expect(around.status).toBe(200)
    const page = (await around.json()) as { messages: RoomMessage[] }
    expect(page.messages.some((message) => message.id === 'msg-b')).toBe(true)

    const missing = await fetch(
      `${base}/api/rooms/general/messages?around=missing`,
      { headers: { origin: 'http://gui.test' } },
    )
    expect(missing.status).toBe(404)
  } finally {
    coordinator.stop()
  }
})

test('multipart messages persist attachment metadata and serve authorized bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sweat-attachments-'))
  const store = new MemoryRoomStore()
  const coordinator = createCoordinator({
    control: new FakeRunControl(),
    store,
    messages: createRoomMessageHub(store),
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    attachmentDirectory: directory,
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    const form = new FormData()
    form.set('text', '')
    form.append(
      'attachments',
      new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        '../avatar.png',
        {
          type: 'image/png',
        },
      ),
    )
    const created = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: { origin: 'http://gui.test' },
      body: form,
    })
    expect(created.status).toBe(201)
    const message = (await created.json()) as {
      message: {
        attachments: Array<{
          id: string
          filename: string
          contentType: string
          byteSize: number
        }>
      }
    }
    expect(message.message.attachments).toEqual([
      {
        id: expect.any(String),
        filename: '.._avatar.png',
        contentType: 'image/png',
        byteSize: 8,
      },
    ])
    const attachmentId = message.message.attachments[0].id
    const source = createRoomAttachmentSource({ store, directory })
    const prepared = await source.read(attachmentId)
    expect(prepared).toMatchObject({
      roomId: GENERAL_ROOM_ID,
      filename: '.._avatar.png',
      byteSize: 8,
      sha256: store.attachments[0]!.sha256,
    })
    expect(prepared?.bytes).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect('storageKey' in prepared!).toBe(false)
    expect(await source.read('missing')).toBeUndefined()
    const downloaded = await fetch(`${base}/api/attachments/${attachmentId}`, {
      headers: { origin: 'http://gui.test' },
    })
    expect(downloaded.status).toBe(200)
    expect(downloaded.headers.get('x-content-type-options')).toBe('nosniff')
    expect(downloaded.headers.get('content-disposition')).toContain(
      '.._avatar.png',
    )
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    const tooMany = new FormData()
    for (let index = 0; index < 6; index++)
      tooMany.append('attachments', new File(['x'], `file-${index}`))
    const rejected = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: { origin: 'http://gui.test' },
      body: tooMany,
    })
    expect(rejected.status).toBe(400)
    expect(await readdir(directory)).toHaveLength(1)
  } finally {
    coordinator.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('a multipart software-engineer message is durable and forwards only its descriptors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sweat-agent-attachments-'))
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const coordinator = createCoordinator({
    control,
    store,
    messages: createRoomMessageHub(store),
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    attachmentDirectory: directory,
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    const form = new FormData()
    form.set('text', '@software-engineer Review this brief')
    form.append('attachments', new File(['agent brief\n'], 'brief.txt'))
    const response = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: { origin: 'http://gui.test' },
      body: form,
    })

    expect(response.status).toBe(202)
    expect(store.messages).toHaveLength(1)
    expect(store.runs).toHaveLength(1)
    const attachment = store.attachments[0]!
    expect(control.requests).toEqual([
      {
        task: 'Review this brief',
        roomId: GENERAL_ROOM_ID,
        agentDefinitionId: 'software-engineer',
        attachments: [
          {
            type: 'attachment',
            id: attachment.id,
            roomId: GENERAL_ROOM_ID,
            filename: 'brief.txt',
            byteSize: 12,
            sha256:
              'be8926bf4a116563971b25303b7e93f237564e5f67163ab8d1200da75b00b0a7',
          },
        ],
      },
    ])
    expect(JSON.stringify(control.requests)).not.toContain(
      attachment.storageKey,
    )

    const missingTask = new FormData()
    missingTask.set('text', '@software-engineer ')
    missingTask.append('attachments', new File(['ignored'], 'ignored.txt'))
    expect(
      (
        await fetch(`${base}/api/rooms/general/messages`, {
          method: 'POST',
          headers: { origin: 'http://gui.test' },
          body: missingTask,
        })
      ).status,
    ).toBe(400)
    expect(store.messages).toHaveLength(1)

    const later = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@software-engineer Follow up' }),
    })
    expect(later.status).toBe(202)
    expect(control.requests[1]?.attachments).toEqual([])
  } finally {
    coordinator.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('an attachment preparation failure leaves the durable message and failed run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sweat-agent-failure-'))
  const store = new MemoryRoomStore()
  const containerCalls: string[][] = []
  const control = createRunControl(
    createWorkspaceAgentsExecutor({
      cursor: () => ({
        apiKey: 'cursor-key',
        model: 'composer-2.5',
      }),
      sandboxProvider: createAppleContainerSandboxProvider({
        createId: () => 'run-missing-attachment',
        container: createAppleContainerClient({
          async run(args) {
            containerCalls.push([...args])
            return { args, exitCode: 0, stdout: '', stderr: '' }
          },
        }),
      }),
    }),
  )
  const coordinator = createCoordinator({
    control,
    store,
    messages: createRoomMessageHub(store),
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    attachmentDirectory: directory,
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    const form = new FormData()
    form.set('text', '@software-engineer Review this brief')
    form.append('attachments', new File(['agent brief\n'], 'brief.txt'))
    const response = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: { origin: 'http://gui.test' },
      body: form,
    })

    expect(response.status).toBe(202)
    const run = store.runs[0]!
    while (store.getRun(run.id)?.state === 'preparing') await Bun.sleep(0)
    expect(store.messages).toHaveLength(1)
    expect(store.getRun(run.id)).toMatchObject({
      state: 'failed',
      error: `Attachment unavailable: ${store.attachments[0]!.id}`,
    })
    expect(containerCalls).toEqual([])
  } finally {
    coordinator.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('mentions and terminal runs create durable directed attention', async () => {
  let currentUser = 'user-1'
  const users: RoomUser[] = [
    { id: 'user-1', name: 'ada', username: 'ada' },
    { id: 'user-2', name: 'bob', username: 'bob' },
  ]
  const store = new MemoryRoomStore()
  store.workspaceUsers = users
  const control = new FakeRunControl()
  const coordinator = createCoordinator({
    control,
    store,
    messages: createRoomMessageHub(store),
    authenticator: {
      authenticate: async () => users.find(({ id }) => id === currentUser),
    },
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  const wsBase = base.replace('http', 'ws')
  try {
    currentUser = 'user-1'
    const requester = await open(`${wsBase}/api/workspace/stream`)
    expect((await requester.next()).type).toBe('workspace.snapshot')
    currentUser = 'user-2'
    let reviewer = await open(`${wsBase}/api/workspace/stream`)
    expect((await reviewer.next()).type).toBe('workspace.snapshot')

    currentUser = 'user-1'
    const response = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: '@software-engineer Fix it. @bob please review.',
      }),
    })
    const run = ((await response.json()) as { run: RoomRun }).run
    expect(await reviewer.next()).toMatchObject({
      type: 'attention.changed',
      roomId: GENERAL_ROOM_ID,
      roomName: 'General',
      attentionCount: 1,
      kind: 'mention',
    })
    expect(await reviewer.next()).toMatchObject({
      type: 'message.created',
      roomId: GENERAL_ROOM_ID,
      authorId: 'user-1',
    })
    reviewer.socket.close()
    currentUser = 'user-2'
    reviewer = await open(`${wsBase}/api/workspace/stream`)
    expect(await reviewer.next()).toMatchObject({
      type: 'workspace.snapshot',
      rooms: [
        expect.objectContaining({
          id: GENERAL_ROOM_ID,
          attentionCount: 1,
          latestOtherMessage: expect.objectContaining({
            authorId: 'user-1',
          }),
        }),
      ],
    })

    control.finish(run.id, 'succeeded')
    expect(await requester.next()).toMatchObject({
      type: 'attention.changed',
      attentionCount: 1,
      kind: 'run_terminal',
    })
    expect(await reviewer.next()).toMatchObject({
      type: 'attention.changed',
      attentionCount: 2,
    })

    currentUser = 'user-2'
    const acknowledged = reviewer.next()
    const acknowledgeResponse = await fetch(
      `${base}/api/rooms/general/attention/acknowledge`,
      { method: 'POST', headers: { origin: 'http://gui.test' } },
    )
    expect(acknowledgeResponse.status).toBe(200)
    expect(await acknowledged).toMatchObject({
      type: 'attention.changed',
      attentionCount: 0,
    })
    expect(store.listMentionRecipientIds(run.triggerMessageId)).toEqual([
      'user-2',
    ])
    const mentionables = (await (
      await fetch(`${base}/api/rooms/general/mentionable-accounts`, {
        headers: { origin: 'http://gui.test' },
      })
    ).json()) as { accounts: RoomUser[] }
    expect(mentionables.accounts.map(({ id }) => id)).toEqual(['user-1'])

    control.finish(run.id, 'failed')
    await expectNoEvent(requester)
    await expectNoEvent(reviewer)

    requester.socket.close()
    reviewer.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('failed and cancelled runs notify their requester', async () => {
  const store = new MemoryRoomStore()
  store.workspaceUsers = [{ id: 'user-1', name: 'ada', username: 'ada' }]
  const control = new FakeRunControl()
  const { coordinator, base } = await makeCoordinator({ store, control })
  const start = async (task: string) => {
    const response = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: `@software-engineer ${task}` }),
    })
    return ((await response.json()) as { run: RoomRun }).run
  }
  try {
    const failed = await start('Fail')
    control.finish(failed.id, 'failed')
    expect(store.listAttentionCounts('user-1').get(GENERAL_ROOM_ID)).toBe(1)

    store.acknowledgeRoomAttention(GENERAL_ROOM_ID, 'user-1', Date.now())
    const cancelled = await start('Cancel')
    await fetch(`${base}/api/rooms/general/runs/${cancelled.id}/cancel`, {
      method: 'POST',
      headers: { origin: 'http://gui.test' },
    })
    expect(store.listAttentionCounts('user-1').get(GENERAL_ROOM_ID)).toBe(1)
  } finally {
    coordinator.stop()
  }
})

test('rooms are created once and streams stay isolated', async () => {
  const control = new FakeRunControl()
  const store = new MemoryRoomStore()
  const { coordinator, base } = await makeCoordinator({ store, control })
  try {
    const general = await open(
      `${base.replace('http', 'ws')}/api/rooms/general/stream`,
    )
    expect((await general.next()).type).toBe('room.snapshot')
    const workspace = await open(
      `${base.replace('http', 'ws')}/api/workspace/stream`,
    )
    expect((await workspace.next()).type).toBe('workspace.snapshot')
    const createdEvent = workspace.next()
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Product' }),
    })
    expect(created.status).toBe(201)
    const room = ((await created.json()) as { room: RoomSummary }).room
    expect(await createdEvent).toMatchObject({ type: 'room.created', room })
    expect(
      (
        await fetch(`${base}/api/rooms`, {
          method: 'POST',
          headers: {
            origin: 'http://gui.test',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: ' product ' }),
        })
      ).status,
    ).toBe(409)
    expect(
      (
        await fetch(`${base}/api/rooms`, {
          method: 'POST',
          headers: {
            origin: 'http://gui.test',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: ' ' }),
        })
      ).status,
    ).toBe(400)
    const product = await open(
      `${base.replace('http', 'ws')}/api/rooms/${room.id}/stream`,
    )
    expect(await product.next()).toMatchObject({ type: 'room.snapshot', room })
    product.socket.send('snapshot')
    expect(
      await Promise.race([
        product.next(),
        Bun.sleep(100).then(() => ({ type: 'timeout' })),
      ]),
    ).toMatchObject({ type: 'room.snapshot', room })
    const productMessage = product.next()
    const sent = await fetch(`${base}/api/rooms/${room.id}/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Only product' }),
    })
    expect(sent.status).toBe(201)
    expect(await productMessage).toMatchObject({
      type: 'message.created',
      message: { roomId: room.id },
    })
    const delegated = await fetch(`${base}/api/rooms/${room.id}/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@software-engineer Fix product' }),
    })
    const run = ((await delegated.json()) as { run: RoomRun }).run
    expect(await product.next()).toMatchObject({
      type: 'message.created',
      message: { roomId: room.id, text: '@software-engineer Fix product' },
    })
    expect(await product.next()).toMatchObject({
      type: 'run.changed',
      run: { id: run.id, roomId: room.id, state: 'preparing' },
    })
    await expectNoEvent(general)
    expect(
      (
        await fetch(`${base}/api/rooms/general/runs/${run.id}/cancel`, {
          method: 'POST',
          headers: { origin: 'http://gui.test' },
        })
      ).status,
    ).toBe(404)
    general.socket.close()
    workspace.socket.close()
    product.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('room endpoints require a session', async () => {
  const store = new MemoryRoomStore()
  const coordinator = createCoordinator({
    control: new FakeRunControl(),
    store,
    messages: createRoomMessageHub(store),
    authenticator: { authenticate: async () => undefined },
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  try {
    const response = await fetch(
      `http://localhost:${coordinator.port}/api/rooms`,
      {
        headers: { origin: 'http://gui.test' },
      },
    )
    expect(response.status).toBe(401)
  } finally {
    coordinator.stop()
  }
})

test('only a room creator or administrator can delete it', async () => {
  let currentUser: RoomUser = { id: 'user-1', name: 'Owner' }
  const store = new MemoryRoomStore()
  const coordinator = createCoordinator({
    control: new FakeRunControl(),
    store,
    messages: createRoomMessageHub(store),
    authenticator: { authenticate: async () => currentUser },
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  const remove = (roomId: string) =>
    fetch(`${base}/api/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { origin: 'http://gui.test' },
    })
  try {
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Owned room' }),
    })
    const { room } = (await created.json()) as { room: RoomSummary }

    currentUser = { id: 'user-2', name: 'Member' }
    expect((await remove(room.id)).status).toBe(403)
    expect(store.getRoom(room.id)).toBeDefined()

    currentUser = { id: 'admin', name: 'Admin', role: 'admin' }
    expect((await remove(GENERAL_ROOM_ID)).status).toBe(403)
    expect(store.getRoom(GENERAL_ROOM_ID)).toBeDefined()
    expect((await remove(room.id)).status).toBe(200)
    expect(store.getRoom(room.id)).toBeUndefined()

    const creatorOwnedRoom = {
      id: 'creator-owned-room',
      name: 'Creator owned room',
      visibility: 'public' as const,
      createdBy: 'user-1',
    }
    store.createRoom(creatorOwnedRoom)
    currentUser = { id: 'user-1', name: 'Owner' }
    expect((await remove(creatorOwnedRoom.id)).status).toBe(200)
  } finally {
    coordinator.stop()
  }
})

test('localhost Vite ports are allowed when the configured GUI is localhost', async () => {
  const store = new MemoryRoomStore()
  const coordinator = createCoordinator({
    control: new FakeRunControl(),
    store,
    messages: createRoomMessageHub(store),
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://localhost:3000',
    port: await port(),
  })
  try {
    const response = await fetch(
      `http://localhost:${coordinator.port}/api/auth/sign-in/email`,
      {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3002' },
      },
    )
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:3002',
    )
    expect(
      (
        await fetch(`http://localhost:${coordinator.port}/api/rooms`, {
          headers: { origin: 'http://evil.test' },
        })
      ).status,
    ).toBe(403)
  } finally {
    coordinator.stop()
  }
})

test('hub post by non-HTTP caller broadcasts message.created to subscribed socket', async () => {
  const store = new MemoryRoomStore()
  store.workspaceUsers = [{ id: 'user-1', name: 'ada', username: 'ada' }]
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const { coordinator, base } = await makeCoordinator({ store, control, messages })
  try {
    const socket = await open(
      `${base.replace('http', 'ws')}/api/rooms/general/stream`,
    )
    expect((await socket.next()).type).toBe('room.snapshot')
    const workspace = await open(
      `${base.replace('http', 'ws')}/api/workspace/stream`,
    )
    expect((await workspace.next()).type).toBe('workspace.snapshot')
    const pending = socket.next()
    const attention = workspace.next()
    messages.postMessage({
      roomId: GENERAL_ROOM_ID,
      author: {
        kind: 'agent',
        id: 'software-engineer',
        name: 'Software engineer',
      },
      text: 'Agent says hello to @ada',
    })
    const event = await pending
    expect(event).toMatchObject({
      type: 'message.created',
      message: {
        roomId: GENERAL_ROOM_ID,
        text: 'Agent says hello to @ada',
      },
    })
    expect(await attention).toMatchObject({
      type: 'attention.changed',
      attentionCount: 1,
    })
    socket.socket.close()
    workspace.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('agent-authored hub post does NOT create a run', async () => {
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const { coordinator, base } = await makeCoordinator({ store, control, messages })
  try {
    const socket = await open(
      `${base.replace('http', 'ws')}/api/rooms/general/stream`,
    )
    expect((await socket.next()).type).toBe('room.snapshot')
    const pending = socket.next()
    messages.postMessage({
      roomId: GENERAL_ROOM_ID,
      author: {
        kind: 'agent',
        id: 'software-engineer',
        name: 'Software engineer',
      },
      text: '@software-engineer do something',
    })
    const event = await pending
    expect(event.type).toBe('message.created')
    // No run should be created by an agent hub post
    expect(control.listRuns()).toHaveLength(0)
    expect(store.runs).toHaveLength(0)
    await expectNoEvent(socket)
    socket.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('step events are persisted and broadcast as run.step to room sockets', async () => {
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const { coordinator, base } = await makeCoordinator({ store, control, messages })
  try {
    // Start a run
    const response = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@software-engineer Do something' }),
    })
    expect(response.status).toBe(202)
    const { run } = (await response.json()) as { run: RoomRun }

    // Create another room to test isolation before opening sockets
    await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Other' }),
    })
    const otherRoom = store.rooms.find((r) => r.name === 'Other')!

    // Open two sockets: one in general room, one in other room
    const general = await open(
      `${base.replace('http', 'ws')}/api/rooms/general/stream`,
    )
    // Consume the snapshot
    expect((await general.next()).type).toBe('room.snapshot')
    const other = await open(
      `${base.replace('http', 'ws')}/api/rooms/${otherRoom.id}/stream`,
    )
    expect((await other.next()).type).toBe('room.snapshot')

    // Emit two steps
    const step1: Step = { kind: 'message', text: 'Hello', at: Date.now() }
    const step2: Step = {
      kind: 'tool_call',
      text: '{}',
      tool: 'shell',
      callId: 'c1',
      at: Date.now(),
    }
    const stepEvent1 = general.next()
    control.emitStep(run.id, step1)
    const received1 = await stepEvent1
    expect(received1).toMatchObject({
      type: 'run.step',
      runId: run.id,
      step: { idx: 0, kind: 'message', text: 'Hello' },
    })

    const stepEvent2 = general.next()
    control.emitStep(run.id, step2)
    const received2 = await stepEvent2
    expect(received2).toMatchObject({
      type: 'run.step',
      runId: run.id,
      step: { idx: 1, kind: 'tool_call', tool: 'shell', callId: 'c1' },
    })

    // Steps are persisted with sequential idx
    const persisted = store.listSteps(run.id)
    expect(persisted).toHaveLength(2)
    expect(persisted[0]).toMatchObject({
      idx: 0,
      kind: 'message',
      text: 'Hello',
    })
    expect(persisted[1]).toMatchObject({
      idx: 1,
      kind: 'tool_call',
      tool: 'shell',
    })

    // Other room socket received no step events
    await expectNoEvent(other)

    general.socket.close()
    other.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('room.snapshot includes latestSteps for active runs', async () => {
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const { coordinator, base } = await makeCoordinator({ store, control, messages })
  try {
    // Start a run and emit a step
    const response = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@software-engineer Do something' }),
    })
    const { run } = (await response.json()) as { run: RoomRun }
    // Update run to 'running' so latestStepsForActiveRuns sees it
    store.updateRun({ ...run, state: 'running' })
    control.emitStep(run.id, {
      kind: 'message',
      text: 'Step A',
      at: Date.now(),
    })

    // Fresh socket should get latestSteps
    const socket = await open(
      `${base.replace('http', 'ws')}/api/rooms/general/stream`,
    )
    const snapshot = await socket.next()
    expect(snapshot.type).toBe('room.snapshot')
    const latestSteps = snapshot.latestSteps as StoredStep[]
    expect(latestSteps).toHaveLength(1)
    expect(latestSteps[0]).toMatchObject({
      runId: run.id,
      idx: 0,
      text: 'Step A',
    })

    socket.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('GET /runs/:runId/steps returns step history, 404 for unknown/mismatched run, 401 without auth', async () => {
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const { coordinator, base } = await makeCoordinator({ store, control, messages })
  try {
    // Start a run in general
    const response = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@software-engineer Do something' }),
    })
    const { run } = (await response.json()) as { run: RoomRun }
    control.emitStep(run.id, { kind: 'message', text: 'First', at: 1000 })
    control.emitStep(run.id, { kind: 'message', text: 'Second', at: 2000 })

    // Correct request
    const ok = await fetch(`${base}/api/rooms/general/runs/${run.id}/steps`, {
      headers: { origin: 'http://gui.test' },
    })
    expect(ok.status).toBe(200)
    const { steps } = (await ok.json()) as { steps: StoredStep[] }
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ idx: 0, text: 'First' })
    expect(steps[1]).toMatchObject({ idx: 1, text: 'Second' })

    // Unknown run
    expect(
      (
        await fetch(`${base}/api/rooms/general/runs/unknown-id/steps`, {
          headers: { origin: 'http://gui.test' },
        })
      ).status,
    ).toBe(404)

    // Run exists but wrong room
    expect(
      (
        await fetch(`${base}/api/rooms/other-room/runs/${run.id}/steps`, {
          headers: { origin: 'http://gui.test' },
        })
      ).status,
    ).toBe(404)

    // No auth — use unauthenticated coordinator
    const noAuthCoord = createCoordinator({
      control: new FakeRunControl(),
      store: new MemoryRoomStore(),
      messages: createRoomMessageHub(new MemoryRoomStore()),
      authenticator: { authenticate: async () => undefined },
      authHandler: async () => new Response('ok'),
      origin: 'http://gui.test',
      port: await port(),
    })
    try {
      expect(
        (
          await fetch(
            `http://localhost:${noAuthCoord.port}/api/rooms/general/runs/x/steps`,
            {
              headers: { origin: 'http://gui.test' },
            },
          )
        ).status,
      ).toBe(401)
    } finally {
      noAuthCoord.stop()
    }
  } finally {
    coordinator.stop()
  }
})

test('non-member gets 404 on all private room endpoints', async () => {
  // user-1 creates a private room; user-2 is not a member
  let currentUser = 'user-1'
  const swappable: SessionAuthenticator = {
    authenticate: async () => ({ id: currentUser, name: currentUser }),
  }
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const { coordinator, base } = await makeCoordinator({ store, control, messages, authenticator: swappable })
  try {
    // user-1 creates a private room (becomes creator/member)
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Secret', visibility: 'private' }),
    })
    expect(created.status).toBe(201)
    const { room } = (await created.json()) as { room: RoomSummary }

    // Start a run as user-1 so we have a run id
    const msgResp = await fetch(`${base}/api/rooms/${room.id}/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@software-engineer Fix it' }),
    })
    expect(msgResp.status).toBe(202)
    const { run } = (await msgResp.json()) as { run: RoomRun }

    // Switch to user-2 who is not a member
    currentUser = 'user-2'

    expect(
      (
        await fetch(`${base}/api/rooms/${room.id}/stream`, {
          headers: { origin: 'http://gui.test', upgrade: 'websocket' },
        })
      ).status,
    ).toBe(404)

    expect(
      (
        await fetch(`${base}/api/rooms/${room.id}/messages`, {
          method: 'POST',
          headers: {
            origin: 'http://gui.test',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ text: 'hello' }),
        })
      ).status,
    ).toBe(404)

    expect(
      (
        await fetch(`${base}/api/rooms/${room.id}/runs/${run.id}/steps`, {
          headers: { origin: 'http://gui.test' },
        })
      ).status,
    ).toBe(404)

    expect(
      (
        await fetch(`${base}/api/rooms/${room.id}/runs/${run.id}/cancel`, {
          method: 'POST',
          headers: { origin: 'http://gui.test' },
        })
      ).status,
    ).toBe(404)
  } finally {
    coordinator.stop()
  }
})

test('member of private room can access its endpoints', async () => {
  let currentUser = 'user-1'
  const swappable: SessionAuthenticator = {
    authenticate: async () => ({ id: currentUser, name: currentUser }),
  }
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const { coordinator, base } = await makeCoordinator({ store, control, messages, authenticator: swappable })
  const wsBase = base.replace('http', 'ws')
  try {
    // user-1 creates the private room
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Members Only', visibility: 'private' }),
    })
    expect(created.status).toBe(201)
    const { room } = (await created.json()) as { room: RoomSummary }

    // Add user-2 as member directly on store
    store.addMember(room.id, 'user-2', 'user-1')

    // Switch to user-2
    currentUser = 'user-2'

    // user-2 can open the websocket stream
    const socket = await open(`${wsBase}/api/rooms/${room.id}/stream`)
    const snapshot = await socket.next()
    expect(snapshot.type).toBe('room.snapshot')

    // user-2 can post messages
    const msgResp = await fetch(`${base}/api/rooms/${room.id}/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'hello from member' }),
    })
    expect(msgResp.status).toBe(201)

    socket.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('GET /api/rooms omits private rooms the user is not in but includes public ones', async () => {
  let currentUser = 'user-1'
  const swappable: SessionAuthenticator = {
    authenticate: async () => ({ id: currentUser, name: currentUser }),
  }
  const store = new MemoryRoomStore()
  const { coordinator, base } = await makeCoordinator({ store, authenticator: swappable })
  try {
    // user-1 creates a public room and a private room
    await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Public Room', visibility: 'public' }),
    })
    await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Private Room', visibility: 'private' }),
    })

    // user-2 should see the public room and general, but not the private room
    currentUser = 'user-2'
    const resp = await fetch(`${base}/api/rooms`, {
      headers: { origin: 'http://gui.test' },
    })
    expect(resp.status).toBe(200)
    const { rooms } = (await resp.json()) as { rooms: RoomSummary[] }
    const names = rooms.map((r) => r.name)
    expect(names).toContain('General')
    expect(names).toContain('Public Room')
    expect(names).not.toContain('Private Room')

    // user-1 should see all three (they own the private room, so they are a member)
    currentUser = 'user-1'
    const resp2 = await fetch(`${base}/api/rooms`, {
      headers: { origin: 'http://gui.test' },
    })
    const { rooms: rooms2 } = (await resp2.json()) as { rooms: RoomSummary[] }
    const names2 = rooms2.map((r) => r.name)
    expect(names2).toContain('Private Room')
  } finally {
    coordinator.stop()
  }
})

test('POST /api/rooms with private visibility does not emit room.created globally; public does', async () => {
  let currentUser = 'user-1'
  const swappable: SessionAuthenticator = {
    authenticate: async () => ({ id: currentUser, name: currentUser }),
  }
  const store = new MemoryRoomStore()
  const { coordinator, base } = await makeCoordinator({ store, authenticator: swappable })
  const wsBase = base.replace('http', 'ws')
  try {
    // user-2's workspace stream receives room discovery changes.
    currentUser = 'user-2'
    const observerSocket = await open(`${wsBase}/api/workspace/stream`)
    expect((await observerSocket.next()).type).toBe('workspace.snapshot')

    // Set up the next-event promise BEFORE creating either room so the waiter
    // queue is empty and the first event to arrive will settle it.
    const firstEvent = observerSocket.next()

    // user-1 creates a private room — this must NOT broadcast room.created
    currentUser = 'user-1'
    const privateResp = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Stealth', visibility: 'private' }),
    })
    expect(privateResp.status).toBe(201)

    // user-1 creates a public room — this MUST broadcast room.created
    const publicResp = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Open', visibility: 'public' }),
    })
    expect(publicResp.status).toBe(201)
    const { room: openRoom } = (await publicResp.json()) as {
      room: RoomSummary
    }

    // The first (and only) event user-2's socket receives should be for the public room
    const event = await firstEvent
    expect(event).toMatchObject({
      type: 'room.created',
      room: { id: openRoom.id, name: 'Open' },
    })

    // No further events (the private room never triggered one)
    await expectNoEvent(observerSocket)

    observerSocket.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('POST /api/rooms with invalid visibility returns 400', async () => {
  const store = new MemoryRoomStore()
  const { coordinator, base } = await makeCoordinator({ store })
  try {
    const resp = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Bad Room', visibility: 'secret' }),
    })
    expect(resp.status).toBe(400)
    const body = (await resp.json()) as { error: string }
    expect(body.error).toBe('Invalid visibility')
  } finally {
    coordinator.stop()
  }
})

test('GET /api/workspace/members returns seeded workspace users', async () => {
  const store = new MemoryRoomStore()
  store.workspaceUsers = [
    { id: 'user-1', name: 'Alice' },
    { id: 'user-2', name: 'Bob' },
  ]
  const { coordinator, base } = await makeCoordinator({ store })
  try {
    const resp = await fetch(`${base}/api/workspace/members`, {
      headers: { origin: 'http://gui.test' },
    })
    expect(resp.status).toBe(200)
    const { users } = (await resp.json()) as { users: RoomUser[] }
    expect(users).toHaveLength(2)
    expect(users.map((u) => u.id)).toContain('user-1')
    expect(users.map((u) => u.id)).toContain('user-2')
  } finally {
    coordinator.stop()
  }
})

test('GET /api/rooms/:id/members returns members for an accessible room', async () => {
  let currentUser = 'user-1'
  const swappable: SessionAuthenticator = {
    authenticate: async () => ({ id: currentUser, name: currentUser }),
  }
  const store = new MemoryRoomStore()
  store.workspaceUsers = [
    { id: 'user-1', name: 'Alice' },
    { id: 'user-2', name: 'Bob' },
  ]
  const { coordinator, base } = await makeCoordinator({ store, authenticator: swappable })
  try {
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'VIP', visibility: 'private' }),
    })
    const { room } = (await created.json()) as { room: RoomSummary }

    // user-1 (owner/member) can list members
    const resp = await fetch(`${base}/api/rooms/${room.id}/members`, {
      headers: { origin: 'http://gui.test' },
    })
    expect(resp.status).toBe(200)
    const { members } = (await resp.json()) as { members: RoomUser[] }
    expect(members.map((m) => m.id)).toContain('user-1')

    // user-2 (non-member) gets 404
    currentUser = 'user-2'
    expect(
      (
        await fetch(`${base}/api/rooms/${room.id}/members`, {
          headers: { origin: 'http://gui.test' },
        })
      ).status,
    ).toBe(404)
  } finally {
    coordinator.stop()
  }
})

test('non-member POST /api/rooms/:id/members returns 404', async () => {
  let currentUser = 'user-1'
  const swappable: SessionAuthenticator = {
    authenticate: async () => ({ id: currentUser, name: currentUser }),
  }
  const store = new MemoryRoomStore()
  store.workspaceUsers = [
    { id: 'user-1', name: 'Alice' },
    { id: 'user-3', name: 'Carol' },
  ]
  const { coordinator, base } = await makeCoordinator({ store, authenticator: swappable })
  try {
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Secret', visibility: 'private' }),
    })
    const { room } = (await created.json()) as { room: RoomSummary }

    // user-2 is not a member — POST to add should return 404
    currentUser = 'user-2'
    const resp = await fetch(`${base}/api/rooms/${room.id}/members`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userId: 'user-3' }),
    })
    expect(resp.status).toBe(404)
  } finally {
    coordinator.stop()
  }
})

test('POST /api/rooms/:id/members on a public room returns 400', async () => {
  const store = new MemoryRoomStore()
  store.workspaceUsers = [
    { id: 'user-1', name: 'Ada' },
    { id: 'user-2', name: 'Bob' },
  ]
  const { coordinator, base } = await makeCoordinator({ store })
  try {
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Open Space', visibility: 'public' }),
    })
    const { room } = (await created.json()) as { room: RoomSummary }

    const resp = await fetch(`${base}/api/rooms/${room.id}/members`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userId: 'user-2' }),
    })
    expect(resp.status).toBe(400)
    const body = (await resp.json()) as { error: string }
    expect(body.error).toBe('Room is not private')
  } finally {
    coordinator.stop()
  }
})

test('POST /api/rooms/:id/members with unknown userId returns 400', async () => {
  const store = new MemoryRoomStore()
  store.workspaceUsers = [{ id: 'user-1', name: 'Ada' }]
  const { coordinator, base } = await makeCoordinator({ store })
  try {
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Private Club', visibility: 'private' }),
    })
    const { room } = (await created.json()) as { room: RoomSummary }

    const resp = await fetch(`${base}/api/rooms/${room.id}/members`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userId: 'ghost-user' }),
    })
    expect(resp.status).toBe(400)
    const body = (await resp.json()) as { error: string }
    expect(body.error).toBe('Unknown user')
  } finally {
    coordinator.stop()
  }
})

test('member adds a workspace user; added user socket gets room.created; room socket gets room.members.changed', async () => {
  let currentUser = 'user-1'
  const swappable: SessionAuthenticator = {
    authenticate: async () => ({ id: currentUser, name: currentUser }),
  }
  const store = new MemoryRoomStore()
  store.workspaceUsers = [
    { id: 'user-1', name: 'Alice' },
    { id: 'user-2', name: 'Bob' },
  ]
  const { coordinator, base } = await makeCoordinator({ store, authenticator: swappable })
  const wsBase = base.replace('http', 'ws')
  try {
    // user-1 creates the private room and opens a stream inside it
    currentUser = 'user-1'
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Exclusive', visibility: 'private' }),
    })
    expect(created.status).toBe(201)
    const { room } = (await created.json()) as { room: RoomSummary }

    // user-1 opens the room stream (to receive room.members.changed)
    const ownerSocket = await open(`${wsBase}/api/rooms/${room.id}/stream`)
    expect((await ownerSocket.next()).type).toBe('room.snapshot')

    // user-2 opens the workspace stream to receive targeted room discovery.
    currentUser = 'user-2'
    const user2Socket = await open(`${wsBase}/api/workspace/stream`)
    expect((await user2Socket.next()).type).toBe('workspace.snapshot')

    // Set up event waiters before the HTTP call
    const membersChangedEvent = ownerSocket.next()
    const roomCreatedForUser2 = user2Socket.next()

    // user-1 adds user-2 as a member
    currentUser = 'user-1'
    const addResp = await fetch(`${base}/api/rooms/${room.id}/members`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userId: 'user-2' }),
    })
    expect(addResp.status).toBe(201)
    const { members } = (await addResp.json()) as { members: RoomUser[] }
    expect(members.map((m) => m.id)).toContain('user-2')

    // owner's room socket should receive room.members.changed
    expect(await membersChangedEvent).toMatchObject({
      type: 'room.members.changed',
      roomId: room.id,
    })

    // user-2's socket (in general) should receive room.created for the private room
    expect(await roomCreatedForUser2).toMatchObject({
      type: 'room.created',
      room: { id: room.id },
    })

    ownerSocket.socket.close()
    user2Socket.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('owner removes another member; removed user gets room.removed; room socket gets room.members.changed', async () => {
  let currentUser = 'user-1'
  const swappable: SessionAuthenticator = {
    authenticate: async () => ({ id: currentUser, name: currentUser }),
  }
  const store = new MemoryRoomStore()
  store.workspaceUsers = [
    { id: 'user-1', name: 'Alice' },
    { id: 'user-2', name: 'Bob' },
  ]
  const { coordinator, base } = await makeCoordinator({ store, authenticator: swappable })
  const wsBase = base.replace('http', 'ws')
  try {
    // user-1 creates private room
    currentUser = 'user-1'
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Inner Circle', visibility: 'private' }),
    })
    const { room } = (await created.json()) as { room: RoomSummary }

    // Add user-2 via store directly
    store.addMember(room.id, 'user-2', 'user-1')

    // user-1 opens the room stream
    const ownerSocket = await open(`${wsBase}/api/rooms/${room.id}/stream`)
    expect((await ownerSocket.next()).type).toBe('room.snapshot')

    // user-2 opens the room stream
    currentUser = 'user-2'
    const user2Socket = await open(`${wsBase}/api/rooms/${room.id}/stream`)
    expect((await user2Socket.next()).type).toBe('room.snapshot')
    const user2Workspace = await open(`${wsBase}/api/workspace/stream`)
    expect((await user2Workspace.next()).type).toBe('workspace.snapshot')

    // Set up event waiters
    const membersChangedEvent = ownerSocket.next()
    const removedEvent = user2Workspace.next()

    // user-1 removes user-2
    currentUser = 'user-1'
    const removeResp = await fetch(
      `${base}/api/rooms/${room.id}/members/user-2`,
      {
        method: 'DELETE',
        headers: { origin: 'http://gui.test' },
      },
    )
    expect(removeResp.status).toBe(200)
    const body = (await removeResp.json()) as { ok: boolean }
    expect(body.ok).toBe(true)

    // room socket receives room.members.changed
    expect(await membersChangedEvent).toMatchObject({
      type: 'room.members.changed',
      roomId: room.id,
    })

    // user-2's socket receives room.removed
    expect(await removedEvent).toMatchObject({
      type: 'room.removed',
      roomId: room.id,
    })

    ownerSocket.socket.close()
    user2Socket.socket.close()
    user2Workspace.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('non-owner removing another member returns 403', async () => {
  let currentUser = 'user-1'
  const swappable: SessionAuthenticator = {
    authenticate: async () => ({ id: currentUser, name: currentUser }),
  }
  const store = new MemoryRoomStore()
  store.workspaceUsers = [
    { id: 'user-1', name: 'Alice' },
    { id: 'user-2', name: 'Bob' },
    { id: 'user-3', name: 'Carol' },
  ]
  const { coordinator, base } = await makeCoordinator({ store, authenticator: swappable })
  try {
    // user-1 owns the room; user-2 and user-3 are members
    currentUser = 'user-1'
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Gang', visibility: 'private' }),
    })
    const { room } = (await created.json()) as { room: RoomSummary }
    store.addMember(room.id, 'user-2', 'user-1')
    store.addMember(room.id, 'user-3', 'user-1')

    // user-2 (non-owner) tries to remove user-3 → 403
    currentUser = 'user-2'
    const resp = await fetch(`${base}/api/rooms/${room.id}/members/user-3`, {
      method: 'DELETE',
      headers: { origin: 'http://gui.test' },
    })
    expect(resp.status).toBe(403)
    const body = (await resp.json()) as { error: string }
    expect(body.error).toBe('Only the room owner can remove members')
  } finally {
    coordinator.stop()
  }
})

test('member removing themselves (leave) is allowed and gets room.removed', async () => {
  let currentUser = 'user-1'
  const swappable: SessionAuthenticator = {
    authenticate: async () => ({ id: currentUser, name: currentUser }),
  }
  const store = new MemoryRoomStore()
  store.workspaceUsers = [
    { id: 'user-1', name: 'Alice' },
    { id: 'user-2', name: 'Bob' },
  ]
  const { coordinator, base } = await makeCoordinator({ store, authenticator: swappable })
  const wsBase = base.replace('http', 'ws')
  try {
    // user-1 creates the room; add user-2 as member
    currentUser = 'user-1'
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Leavable', visibility: 'private' }),
    })
    const { room } = (await created.json()) as { room: RoomSummary }
    store.addMember(room.id, 'user-2', 'user-1')

    // user-2 opens the workspace stream.
    currentUser = 'user-2'
    const user2Socket = await open(`${wsBase}/api/workspace/stream`)
    expect((await user2Socket.next()).type).toBe('workspace.snapshot')

    // Set up waiter for room.removed
    const removedEvent = user2Socket.next()

    // user-2 removes themselves (leave)
    const leaveResp = await fetch(
      `${base}/api/rooms/${room.id}/members/user-2`,
      {
        method: 'DELETE',
        headers: { origin: 'http://gui.test' },
      },
    )
    expect(leaveResp.status).toBe(200)

    // user-2 receives room.removed
    expect(await removedEvent).toMatchObject({
      type: 'room.removed',
      roomId: room.id,
    })

    // user-2 is no longer a member
    expect(
      store.members.some((m) => m.roomId === room.id && m.userId === 'user-2'),
    ).toBe(false)

    user2Socket.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('allowedOrigin permits every desktop origin regardless of configured origin', () => {
  // Windows reports `http://tauri.localhost` where macOS and Linux report
  // `tauri://localhost`. Missing the Windows one 403s the whole app.
  for (const origin of [
    'tauri://localhost',
    'http://tauri.localhost',
    'https://tauri.localhost',
  ]) {
    expect(allowedOrigin(origin, 'http://localhost:3000')).toBe(origin)
    expect(allowedOrigin(origin, 'https://app.example.com')).toBe(origin)
  }
})

test('allowedOrigin rejects disallowed origins', () => {
  expect(
    allowedOrigin('https://evil.example', 'http://localhost:3000'),
  ).toBeUndefined()
  expect(
    allowedOrigin('https://evil.example', 'https://app.example.com'),
  ).toBeUndefined()
})

test('PATCH edits own message text without starting runs or creating attention', async () => {
  let currentUser = 'user-1'
  const users: RoomUser[] = [
    { id: 'user-1', name: 'ada', username: 'ada' },
    { id: 'user-2', name: 'bob', username: 'bob' },
  ]
  const store = new MemoryRoomStore()
  store.workspaceUsers = users
  const control = new FakeRunControl()
  const coordinator = createCoordinator({
    control,
    store,
    messages: createRoomMessageHub(store),
    authenticator: {
      authenticate: async () => users.find(({ id }) => id === currentUser),
    },
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    const room = await open(
      `${base.replace('http', 'ws')}/api/rooms/general/stream`,
    )
    expect((await room.next()).type).toBe('room.snapshot')
    currentUser = 'user-2'
    const reviewer = await open(`${base.replace('http', 'ws')}/api/workspace/stream`)
    expect((await reviewer.next()).type).toBe('workspace.snapshot')

    currentUser = 'user-1'
    const created = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Original note for @bob' }),
    })
    expect(created.status).toBe(201)
    const message = ((await created.json()) as { message: RoomMessage }).message
    expect((await room.next()).type).toBe('message.created')
    expect(await reviewer.next()).toMatchObject({
      type: 'attention.changed',
      kind: 'mention',
    })
    expect(await reviewer.next()).toMatchObject({ type: 'message.created' })
    const attentionAfterCreate = store.attentions.length
    const runCount = control.requests.length

    const updatedEvent = room.next()
    const patched = await fetch(
      `${base}/api/rooms/general/messages/${message.id}`,
      {
        method: 'PATCH',
        headers: {
          origin: 'http://gui.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Edited note mentioning @bob again' }),
      },
    )
    expect(patched.status).toBe(200)
    const body = (await patched.json()) as { message: RoomMessage }
    expect(body.message.text).toBe('Edited note mentioning @bob again')
    expect(body.message.editedAt).toBeDefined()
    expect(body.message.id).toBe(message.id)
    expect(await updatedEvent).toMatchObject({
      type: 'message.updated',
      message: {
        id: message.id,
        text: 'Edited note mentioning @bob again',
      },
    })
    await expectNoEvent(reviewer)
    expect(store.attentions).toHaveLength(attentionAfterCreate)
    expect(control.requests).toHaveLength(runCount)
    expect(store.messages[0]!.text).toBe('Edited note mentioning @bob again')
  } finally {
    coordinator.stop()
  }
})

test('PATCH rejects empty text, other authors, and missing messages', async () => {
  const store = new MemoryRoomStore()
  const messages = createRoomMessageHub(store)
  const mine = messages.postMessage({
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Mine',
  })
  const theirs = messages.postMessage({
    roomId: GENERAL_ROOM_ID,
    author: { kind: 'user', id: 'user-2', name: 'Bob' },
    text: 'Theirs',
  })
  const coordinator = createCoordinator({
    control: new FakeRunControl(),
    store,
    messages,
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    const empty = await fetch(
      `${base}/api/rooms/general/messages/${mine.id}`,
      {
        method: 'PATCH',
        headers: {
          origin: 'http://gui.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: '   ' }),
      },
    )
    expect(empty.status).toBe(400)

    const forbidden = await fetch(
      `${base}/api/rooms/general/messages/${theirs.id}`,
      {
        method: 'PATCH',
        headers: {
          origin: 'http://gui.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hijack' }),
      },
    )
    expect(forbidden.status).toBe(403)

    const missing = await fetch(
      `${base}/api/rooms/general/messages/does-not-exist`,
      {
        method: 'PATCH',
        headers: {
          origin: 'http://gui.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Nope' }),
      },
    )
    expect(missing.status).toBe(404)
  } finally {
    coordinator.stop()
  }
})

test('a realtime ticket round-trips to its user id', () => {
  expect(verifyRealtimeTicket(mintRealtimeTicket('user_abc'))).toBe('user_abc')
})

test('verifyRealtimeTicket rejects tampered and malformed tickets', () => {
  const ticket = mintRealtimeTicket('user_abc')
  expect(verifyRealtimeTicket(ticket.slice(0, -2) + 'xx')).toBeUndefined()
  expect(verifyRealtimeTicket('not-a-ticket')).toBeUndefined()
  expect(verifyRealtimeTicket('')).toBeUndefined()
})

test('sandbox provider configuration accepts only the supported providers', () => {
  expect(parseSandboxProvider('apple-container')).toBe('apple-container')
  expect(parseSandboxProvider('docker')).toBe('docker')
  expect(() => parseSandboxProvider(undefined)).toThrow(
    'SWEAT_SANDBOX_PROVIDER must be set to one of: apple-container, docker',
  )
  expect(() => parseSandboxProvider('podman')).toThrow(
    'SWEAT_SANDBOX_PROVIDER must be set to one of: apple-container, docker',
  )
})
