import type { ServerWebSocket } from 'bun'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  createRunControl,
  type RunControl,
  type RunSummary,
} from './run-control'
import {
  createSqliteRoomStore,
  type RoomMessage,
  type RoomMessageMarker,
  type RoomRun,
  type RoomSummary,
  type RoomStore,
  type RoomUser,
  type StoredStep,
} from './room-store'
import { createRoomMessageHub, type RoomMessageHub } from './room-hub'
import {
  createAdmissionHttpHandler,
  type AdmissionOptions,
} from './admission-http'
import { canDeleteRoom } from '#/features/rooms/permissions'
import { mentionedAccounts } from './attention'
import {
  attachmentBytes,
  attachmentDirectory,
  createRoomAttachmentSource,
  MAX_REQUEST_BYTES,
  removeAttachmentFiles,
  stageAttachments,
} from './attachments'
import { previewCron } from '#/features/schedules/cron'
import {
  createSqliteScheduleStore,
  type Schedule,
  type ScheduleRun,
  type ScheduleRunStep,
  type ScheduleStore,
} from './schedule-store'
import {
  createScheduleRunner,
  ScheduleActiveRunError,
  type ScheduleRunner,
} from './schedule-runner'

export interface SessionAuthenticator {
  authenticate(request: Request): Promise<RoomUser | undefined>
}

// Short-lived, single-process HMAC ticket used to authenticate the realtime
// WebSocket. The desktop client authenticates over HTTP (cookie jar), fetches a
// ticket, and passes it in the stream URL — the WebSocket transport cannot carry
// the HTTP session, so the ticket bridges an already-authenticated HTTP request
// to the upgrade.
const realtimeTicketSecret = randomBytes(32)
const realtimeTicketTtlMs = 30_000
export const mintRealtimeTicket = (userId: string): string => {
  const body = Buffer.from(
    `${userId}|${Date.now() + realtimeTicketTtlMs}`,
  ).toString('base64url')
  const sig = createHmac('sha256', realtimeTicketSecret)
    .update(body)
    .digest('base64url')
  return `${body}.${sig}`
}
export const verifyRealtimeTicket = (ticket: string): string | undefined => {
  const [body, sig] = ticket.split('.')
  if (!body || !sig) return undefined
  const expected = createHmac('sha256', realtimeTicketSecret)
    .update(body)
    .digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf))
    return undefined
  const [userId, expiry] = Buffer.from(body, 'base64url').toString().split('|')
  if (!userId || !expiry || Date.now() > Number(expiry)) return undefined
  return userId
}

export type RoomServerMessage =
  | {
      type: 'room.snapshot'
      room: WorkspaceRoom
      messages: RoomMessage[]
      runs: RoomRun[]
      nextCursor?: string
      latestSteps: StoredStep[]
    }
  | { type: 'message.created'; message: RoomMessage }
  | { type: 'run.changed'; run: RoomRun }
  | { type: 'run.step'; runId: string; step: StoredStep }
  | { type: 'room.members.changed'; roomId: string }
export type WorkspaceRoom = RoomSummary & {
  attentionCount: number
  mentionCount: number
  latestOtherMessage?: RoomMessageMarker
}
export type WorkspaceServerMessage =
  | { type: 'workspace.snapshot'; rooms: WorkspaceRoom[] }
  | { type: 'room.created'; room: WorkspaceRoom }
  | { type: 'room.removed'; roomId: string }
  | {
      type: 'attention.changed'
      roomId: string
      roomName: string
      attentionCount: number
      mentionCount: number
      kind?: 'mention' | 'run_terminal'
    }
  | {
      type: 'message.created'
      roomId: string
      messageId: string
      createdAt: number
      authorId: string
    }
  | { type: 'schedule.created'; schedule: Schedule }
  | { type: 'schedule.changed'; schedule: Schedule }
  | { type: 'schedule_run.created'; run: ScheduleRun }
  | { type: 'schedule_run.changed'; run: ScheduleRun }
  | { type: 'schedule_run.step'; runId: string; step: ScheduleRunStep }
export type ServerMessage = RoomServerMessage | WorkspaceServerMessage

export type AgentDefinitionSummary = {
  id: string
  name: string
  description: string
  capabilities: { id: string; name: string; tools: string[] }[]
}

const roomHistoryPageSize = 50

type SocketData =
  | { scope: 'room'; roomId: string; userId: string }
  | { scope: 'workspace'; userId: string }

const send = (
  socket: ServerWebSocket<SocketData>,
  message: ServerMessage,
): void => {
  socket.send(JSON.stringify(message))
}
const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status })
const withCors = (response: Response, origin: string): Response => {
  const headers = new Headers(response.headers)
  headers.set('access-control-allow-origin', origin)
  headers.set('access-control-allow-credentials', 'true')
  headers.set('vary', 'Origin')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
export const allowedOrigin = (
  origin: string | null,
  configured: string,
): string | undefined => {
  if (origin === configured) return origin
  if (origin === 'tauri://localhost') return origin
  if (
    new URL(configured).hostname === 'localhost' &&
    origin !== null &&
    /^http:\/\/localhost:\d+$/.test(origin)
  )
    return origin
  return undefined
}

export type SandboxProviderName = 'apple-container' | 'docker'

export function parseSandboxProvider(
  value: string | undefined,
): SandboxProviderName {
  if (value === 'apple-container' || value === 'docker') return value
  throw new Error(
    'SWEAT_SANDBOX_PROVIDER must be set to one of: apple-container, docker',
  )
}

async function textFrom(request: Request): Promise<string | undefined> {
  try {
    const body: unknown = await request.json()
    const text =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).text
        : undefined
    return typeof text === 'string' && text.trim() && text.length <= 10_000
      ? text.trim()
      : undefined
  } catch {
    return undefined
  }
}
async function messageInputFrom(
  request: Request,
): Promise<{ text: string; files: File[] } | { error: string }> {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const text = await textFrom(request)
    return text ? { text, files: [] } : { error: 'Invalid message' }
  }
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_REQUEST_BYTES)
    return { error: 'Attachments must total 50 MiB or less' }
  try {
    const bytes = await request.arrayBuffer()
    if (bytes.byteLength > MAX_REQUEST_BYTES)
      return { error: 'Attachments must total 50 MiB or less' }
    const contentType = request.headers.get('content-type')
    if (!contentType) return { error: 'Invalid message' }
    const form = await new Response(bytes, {
      headers: { 'content-type': contentType },
    }).formData()
    const rawText = form.get('text')
    const text = typeof rawText === 'string' ? rawText.trim() : ''
    if (text.length > 10_000) return { error: 'Invalid message' }
    const files = form
      .getAll('attachments')
      .filter((entry): entry is File => entry instanceof File)
    if (form.getAll('attachments').length !== files.length)
      return { error: 'Invalid attachment' }
    return text || files.length ? { text, files } : { error: 'Invalid message' }
  } catch {
    return { error: 'Invalid message' }
  }
}
type RoomBody =
  | {
      name: string
      visibility: 'public' | 'private'
      visibilityInvalid?: false
    }
  | { visibilityInvalid: true; name?: string; visibility?: never }
async function roomBodyFrom(request: Request): Promise<RoomBody | undefined> {
  try {
    const body: unknown = await request.json()
    const raw =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>)
        : undefined
    if (!raw) return undefined
    const name = raw.name
    if (typeof name !== 'string') return undefined
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > 50) return undefined
    const rawVisibility = raw.visibility
    if (
      rawVisibility !== undefined &&
      rawVisibility !== 'public' &&
      rawVisibility !== 'private'
    )
      return { visibilityInvalid: true }
    const visibility: 'public' | 'private' =
      rawVisibility === 'private' ? 'private' : 'public'
    return { name: trimmed, visibility }
  } catch {
    return undefined
  }
}

export function createCoordinator(options: {
  control: RunControl
  store: RoomStore
  messages: RoomMessageHub
  authenticator: SessionAuthenticator
  authHandler: (request: Request) => Promise<Response>
  origin: string
  attachmentDirectory?: string
  port?: number
  admission?: AdmissionOptions
  agentReady?: () => boolean
  scheduleStore?: ScheduleStore
  agentDefinitions?: () => AgentDefinitionSummary[]
}) {
  const attachmentsDirectory =
    options.attachmentDirectory ??
    attachmentDirectory(process.env.SWEAT_DATABASE_PATH ?? './sweat.sqlite')
  const sockets = new Set<ServerWebSocket<SocketData>>()
  const admissionHandler = options.admission
    ? createAdmissionHttpHandler({
        ...options.admission,
        authenticate: (request) => options.authenticator.authenticate(request),
        guiOrigin: options.origin,
        onSuspend: (userId) => {
          for (const socket of sockets)
            if (socket.data.userId === userId)
              socket.close(1008, 'Account suspended')
        },
      })
    : undefined
  const roomsFor = (userId: string): WorkspaceRoom[] => {
    const counts = options.store.listAttentionCounts(userId)
    const mentionCounts = options.store.listAttentionCounts(userId, 'mention')
    return options.store.listRoomsForUser(userId).map((room) => {
      const latestOtherMessage = options.store.latestMessageFromOther(
        room.id,
        userId,
      )
      return {
        ...room,
        attentionCount: counts.get(room.id) ?? 0,
        mentionCount: mentionCounts.get(room.id) ?? 0,
        ...(latestOtherMessage ? { latestOtherMessage } : {}),
      }
    })
  }
  const agentDefinitions = (): AgentDefinitionSummary[] =>
    options.agentDefinitions?.() ?? [
      {
        id: 'software-engineer',
        name: 'Software engineer',
        description: 'Build, debug, and review code.',
        capabilities: [
          {
            id: 'linear.issues',
            name: 'Linear issues',
            tools: [
              'Get issues',
              'List issues',
              'Save comments',
              'Save issues',
            ],
          },
          {
            id: 'github.pull-requests',
            name: 'GitHub pull requests',
            tools: ['Create pull requests', 'Wait for pull request checks'],
          },
        ],
      },
    ]
  const broadcastWorkspace = (message: WorkspaceServerMessage): void => {
    for (const socket of sockets)
      if (socket.data.scope === 'workspace') send(socket, message)
  }
  const broadcastRoom = (roomId: string, message: RoomServerMessage): void => {
    for (const socket of sockets)
      if (socket.data.scope === 'room' && socket.data.roomId === roomId)
        send(socket, message)
  }
  const broadcastWorkspaceToUsers = (
    userIds: Set<string>,
    message: WorkspaceServerMessage,
  ): void => {
    for (const socket of sockets)
      if (socket.data.scope === 'workspace' && userIds.has(socket.data.userId))
        send(socket, message)
  }
  const broadcastWorkspaceMessage = (message: {
    roomId: string
    messageId: string
    createdAt: number
    authorId: string
  }): void => {
    for (const socket of sockets)
      if (
        socket.data.scope === 'workspace' &&
        socket.data.userId !== message.authorId &&
        options.store.canAccessRoom(message.roomId, socket.data.userId)
      )
        send(socket, { type: 'message.created', ...message })
  }
  let scheduleRunner: ScheduleRunner | undefined
  if (options.scheduleStore) {
    scheduleRunner = createScheduleRunner({
      store: options.scheduleStore,
      control: options.control,
      onScheduleChange: (schedule) =>
        broadcastWorkspace({ type: 'schedule.changed', schedule }),
      onRunCreated: (run) =>
        broadcastWorkspace({ type: 'schedule_run.created', run }),
      onRunChange: (run) =>
        broadcastWorkspace({ type: 'schedule_run.changed', run }),
      onStep: (step) =>
        broadcastWorkspace({
          type: 'schedule_run.step',
          runId: step.runId,
          step,
        }),
    })
  }
  const broadcastAttention = (
    userId: string,
    roomId: string,
    kind?: 'mention' | 'run_terminal',
  ): void => {
    const attentionCount =
      options.store.listAttentionCounts(userId).get(roomId) ?? 0
    const mentionCount =
      options.store.listAttentionCounts(userId, 'mention').get(roomId) ?? 0
    broadcastWorkspaceToUsers(new Set([userId]), {
      type: 'attention.changed',
      roomId,
      roomName: options.store.getRoom(roomId)?.name ?? 'Room',
      attentionCount,
      mentionCount,
      ...(kind ? { kind } : {}),
    })
  }
  const createAttention = (
    roomId: string,
    recipientId: string,
    kind: 'mention' | 'run_terminal',
    sourceId: string,
    createdAt: number,
  ): void => {
    if (
      options.store.createAttention({
        id: crypto.randomUUID(),
        roomId,
        recipientId,
        kind,
        sourceId,
        createdAt,
      })
    )
      broadcastAttention(recipientId, roomId, kind)
  }
  const sendSnapshot = (socket: ServerWebSocket<SocketData>): void => {
    if (socket.data.scope === 'workspace') {
      send(socket, {
        type: 'workspace.snapshot',
        rooms: roomsFor(socket.data.userId),
      })
      return
    }
    const room = options.store.getRoom(socket.data.roomId)
    if (!room) return socket.close()
    const page = options.store.listRoomHistoryPage(socket.data.roomId, {
      limit: roomHistoryPageSize,
    })
    const roomState = roomsFor(socket.data.userId).find(
      ({ id }) => id === room.id,
    )
    send(socket, {
      type: 'room.snapshot',
      room: {
        ...room,
        attentionCount: roomState?.attentionCount ?? 0,
        mentionCount: roomState?.mentionCount ?? 0,
        ...(roomState?.latestOtherMessage
          ? { latestOtherMessage: roomState.latestOtherMessage }
          : {}),
      },
      messages: page.messages,
      runs: page.runs,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      latestSteps: [
        ...options.store.latestStepsForActiveRuns(socket.data.roomId).values(),
      ],
    })
  }
  const notifyRunTerminal = (run: RoomRun): void => {
    const eligible = new Set(
      options.store.listMentionableAccounts(run.roomId).map(({ id }) => id),
    )
    const recipients = new Set([
      run.requestedBy.id,
      ...options.store.listMentionRecipientIds(run.triggerMessageId),
    ])
    for (const recipientId of recipients)
      if (eligible.has(recipientId))
        createAttention(
          run.roomId,
          recipientId,
          'run_terminal',
          run.id,
          run.completedAt ?? Date.now(),
        )
  }
  const project = (run: RunSummary): void => {
    const saved = options.store.getRun(run.id)
    if (!saved) return
    const changed = { ...saved, ...run }
    options.store.updateRun(changed)
    broadcastRoom(changed.roomId, { type: 'run.changed', run: changed })
    if (
      changed.state === 'succeeded' ||
      changed.state === 'failed' ||
      changed.state === 'cancelled'
    )
      notifyRunTerminal(changed)
  }
  const unsubscribe = options.control.subscribe(project)
  const unsubscribeMessages = options.messages.subscribe((event) => {
    broadcastRoom(event.message.roomId, event)
    for (const account of mentionedAccounts(
      event.message.text,
      options.store.listMentionableAccounts(event.message.roomId),
    )) {
      if (
        event.message.author.kind === 'user' &&
        event.message.author.id === account.id
      )
        continue
      createAttention(
        event.message.roomId,
        account.id,
        'mention',
        event.message.id,
        event.message.createdAt,
      )
    }
    broadcastWorkspaceMessage({
      roomId: event.message.roomId,
      messageId: event.message.id,
      createdAt: event.message.createdAt,
      authorId: event.message.author.id,
    })
  })
  const stepIndex = new Map<string, number>()
  const unsubscribeSteps = options.control.subscribeSteps((runId, step) => {
    const run = options.store.getRun(runId)
    if (!run) return
    const idx = stepIndex.get(runId) ?? 0
    stepIndex.set(runId, idx + 1)
    const stored: StoredStep = {
      id: crypto.randomUUID(),
      runId,
      roomId: run.roomId,
      idx,
      kind: step.kind,
      ...(step.tool !== undefined ? { tool: step.tool } : {}),
      ...(step.callId !== undefined ? { callId: step.callId } : {}),
      text: step.text,
      createdAt: step.at,
    }
    options.store.appendStep(stored)
    broadcastRoom(run.roomId, { type: 'run.step', runId, step: stored })
  })
  options.store.failStaleRuns().forEach((run) => {
    broadcastRoom(run.roomId, { type: 'run.changed', run })
    notifyRunTerminal(run)
  })
  scheduleRunner?.failStaleRuns()
  scheduleRunner?.tick()
  const scheduleInterval = scheduleRunner
    ? setInterval(() => scheduleRunner!.tick(), 15_000)
    : undefined
  const server = Bun.serve<SocketData>({
    port: options.port ?? 3001,
    async fetch(request, server) {
      const url = new URL(request.url)
      const origin = allowedOrigin(
        request.headers.get('origin'),
        options.origin,
      )
      const cors = (response: Response): Response => withCors(response, origin!)
      if (!origin) return json({ error: 'Forbidden' }, 403)
      if (request.method === 'OPTIONS')
        return cors(
          new Response(null, {
            status: 204,
            headers: {
              'access-control-allow-headers':
                'content-type, x-sweat-setup-token',
              'access-control-allow-methods':
                'GET, POST, PATCH, DELETE, OPTIONS',
            },
          }),
        )
      const admissionResponse = admissionHandler
        ? await admissionHandler(request, url)
        : undefined
      if (admissionResponse) return cors(admissionResponse)
      if (url.pathname.startsWith('/api/auth/'))
        return cors(await options.authHandler(request))
      const stream = url.pathname.match(/^\/api\/rooms\/([^/]+)\/stream$/)
      const workspaceStream = url.pathname === '/api/workspace/stream'
      if (
        (stream || workspaceStream) &&
        request.headers.get('upgrade')?.toLowerCase() === 'websocket'
      ) {
        // Authenticate the upgrade by realtime ticket (desktop) or session (browser).
        const ticket = url.searchParams.get('ticket')
        const userId =
          (ticket ? verifyRealtimeTicket(ticket) : undefined) ??
          (await options.authenticator.authenticate(request))?.id
        if (!userId) return cors(json({ error: 'Unauthorized' }, 401))
        if (workspaceStream)
          return server.upgrade(request, {
            data: { scope: 'workspace', userId },
          })
            ? undefined
            : json({ error: 'Upgrade failed' }, 400)
        const roomId = stream![1]!
        if (!options.store.canAccessRoom(roomId, userId))
          return cors(json({ error: 'Room not found' }, 404))
        return server.upgrade(request, {
          data: { scope: 'room', roomId, userId },
        })
          ? undefined
          : json({ error: 'Upgrade failed' }, 400)
      }
      const user = await options.authenticator.authenticate(request)
      if (!user) return cors(json({ error: 'Unauthorized' }, 401))
      if (url.pathname === '/api/realtime-ticket' && request.method === 'GET')
        return cors(json({ ticket: mintRealtimeTicket(user.id) }))
      if (url.pathname === '/api/agent-definitions' && request.method === 'GET')
        return cors(json({ agents: agentDefinitions() }))
      if (options.scheduleStore) {
        const scheduleBody = async (): Promise<
          Record<string, unknown> | undefined
        > => {
          try {
            const body = await request.json()
            return body && typeof body === 'object'
              ? (body as Record<string, unknown>)
              : undefined
          } catch {
            return undefined
          }
        }
        const knownAgent = (id: unknown): id is string =>
          typeof id === 'string' &&
          agentDefinitions().some((agent) => agent.id === id)
        const scheduleInput = (body: Record<string, unknown>, now: number) => {
          const name = typeof body.name === 'string' ? body.name.trim() : ''
          const task = typeof body.task === 'string' ? body.task.trim() : ''
          const agentDefinitionId = body.agentDefinitionId
          const cronExpression =
            typeof body.cronExpression === 'string'
              ? body.cronExpression.trim()
              : ''
          const timezone =
            typeof body.timezone === 'string' ? body.timezone.trim() : ''
          if (!name || name.length > 50 || !task || task.length > 10_000)
            throw new Error('Invalid schedule name or task')
          if (!knownAgent(agentDefinitionId))
            throw new Error('Unknown agent definition')
          const preview = previewCron(cronExpression, timezone, now)
          return {
            name,
            task,
            agentDefinitionId,
            cronExpression,
            timezone,
            nextRunAt: preview.nextRuns[0]!,
          }
        }
        if (url.pathname === '/api/schedules' && request.method === 'GET')
          return cors(
            json({
              schedules: options.scheduleStore.listSchedules(
                url.searchParams.get('archived') !== 'true',
              ),
            }),
          )
        if (url.pathname === '/api/schedules' && request.method === 'POST') {
          const body = await scheduleBody()
          if (!body) return cors(json({ error: 'Invalid schedule' }, 400))
          try {
            const input = scheduleInput(body, Date.now())
            const schedule = options.scheduleStore.createSchedule({
              id: crypto.randomUUID(),
              ...input,
              state: 'active',
              createdBy: user.id,
              createdAt: Date.now(),
            })
            broadcastWorkspace({ type: 'schedule.created', schedule })
            return cors(json({ schedule }, 201))
          } catch (error) {
            return cors(
              json(
                {
                  error:
                    error instanceof Error ? error.message : 'Invalid schedule',
                },
                400,
              ),
            )
          }
        }
        const scheduleRoute = url.pathname.match(/^\/api\/schedules\/([^/]+)$/)
        if (scheduleRoute && request.method === 'PATCH') {
          const schedule = options.scheduleStore.getSchedule(scheduleRoute[1]!)
          if (!schedule) return cors(json({ error: 'Schedule not found' }, 404))
          const body = await scheduleBody()
          if (!body) return cors(json({ error: 'Invalid schedule' }, 400))
          try {
            const input = {
              ...(body.name === undefined
                ? {}
                : {
                    name: typeof body.name === 'string' ? body.name.trim() : '',
                  }),
              ...(body.task === undefined
                ? {}
                : {
                    task: typeof body.task === 'string' ? body.task.trim() : '',
                  }),
              ...(body.agentDefinitionId === undefined
                ? {}
                : { agentDefinitionId: body.agentDefinitionId as string }),
              ...(body.cronExpression === undefined
                ? {}
                : {
                    cronExpression:
                      typeof body.cronExpression === 'string'
                        ? body.cronExpression.trim()
                        : '',
                  }),
              ...(body.timezone === undefined
                ? {}
                : {
                    timezone:
                      typeof body.timezone === 'string'
                        ? body.timezone.trim()
                        : '',
                  }),
              ...(body.state === undefined
                ? {}
                : { state: body.state as Schedule['state'] }),
            }
            if (
              input.name !== undefined &&
              (!input.name || input.name.length > 50)
            )
              throw new Error('Invalid schedule name')
            if (
              input.task !== undefined &&
              (!input.task || input.task.length > 10_000)
            )
              throw new Error('Invalid schedule task')
            if (
              body.agentDefinitionId !== undefined &&
              !knownAgent(body.agentDefinitionId)
            )
              throw new Error('Unknown agent definition')
            if (
              input.cronExpression !== undefined ||
              input.timezone !== undefined
            )
              previewCron(
                input.cronExpression ?? schedule.cronExpression,
                input.timezone ?? schedule.timezone,
                Date.now(),
              )
            if (
              input.state !== undefined &&
              !['active', 'paused', 'archived'].includes(input.state)
            )
              throw new Error('Invalid schedule state')
            const updated = options.scheduleStore.updateSchedule(
              schedule.id,
              input,
              Date.now(),
            )
            broadcastWorkspace({ type: 'schedule.changed', schedule: updated })
            return cors(json({ schedule: updated }))
          } catch (error) {
            return cors(
              json(
                {
                  error:
                    error instanceof Error ? error.message : 'Invalid schedule',
                },
                400,
              ),
            )
          }
        }
        const runsRoute = url.pathname.match(
          /^\/api\/schedules\/([^/]+)\/runs$/,
        )
        if (runsRoute && request.method === 'GET') {
          if (!options.scheduleStore.getSchedule(runsRoute[1]!))
            return cors(json({ error: 'Schedule not found' }, 404))
          try {
            return cors(
              json({
                ...options.scheduleStore.listRuns(runsRoute[1]!, {
                  limit: Number(url.searchParams.get('limit') ?? 50),
                  cursor: url.searchParams.get('cursor') ?? undefined,
                }),
              }),
            )
          } catch (error) {
            return cors(
              json(
                {
                  error:
                    error instanceof Error ? error.message : 'Invalid cursor',
                },
                400,
              ),
            )
          }
        }
        if (runsRoute && request.method === 'POST') {
          if (!scheduleRunner)
            return cors(json({ error: 'Scheduler unavailable' }, 503))
          try {
            const run = scheduleRunner.runNow(runsRoute[1]!, user.id)
            return cors(json({ run }, 202))
          } catch (error) {
            if (error instanceof ScheduleActiveRunError)
              return cors(json({ error: error.message }, 409))
            if (
              error instanceof Error &&
              error.message === 'Schedule not found'
            )
              return cors(json({ error: error.message }, 404))
            return cors(
              json(
                {
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Unable to start schedule',
                },
                502,
              ),
            )
          }
        }
        const scheduleRunRoute = url.pathname.match(
          /^\/api\/schedule-runs\/([^/]+)$/,
        )
        if (scheduleRunRoute && request.method === 'GET') {
          const run = options.scheduleStore.getRun(scheduleRunRoute[1]!)
          return run
            ? cors(json({ run }))
            : cors(json({ error: 'Run not found' }, 404))
        }
        const scheduleRunCancel = url.pathname.match(
          /^\/api\/schedule-runs\/([^/]+)\/cancel$/,
        )
        if (scheduleRunCancel && request.method === 'POST') {
          const run = options.scheduleStore.getRun(scheduleRunCancel[1]!)
          if (!run) return cors(json({ error: 'Run not found' }, 404))
          const changed = await scheduleRunner?.cancel(run.id)
          return cors(json({ run: changed ?? run }))
        }
        const scheduleRunSteps = url.pathname.match(
          /^\/api\/schedule-runs\/([^/]+)\/steps$/,
        )
        if (scheduleRunSteps && request.method === 'GET') {
          if (!options.scheduleStore.getRun(scheduleRunSteps[1]!))
            return cors(json({ error: 'Run not found' }, 404))
          return cors(
            json({
              steps: options.scheduleStore.listSteps(scheduleRunSteps[1]!),
            }),
          )
        }
      }
      if (url.pathname === '/api/rooms' && request.method === 'GET')
        return cors(json({ rooms: roomsFor(user.id) }))
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const body = await roomBodyFrom(request)
        if (!body) return cors(json({ error: 'Invalid room name' }, 400))
        if (body.visibilityInvalid)
          return cors(json({ error: 'Invalid visibility' }, 400))
        const room = {
          id: crypto.randomUUID(),
          name: body.name,
          visibility: body.visibility,
          createdBy: user.id,
        }
        if (!options.store.createRoom(room))
          return cors(json({ error: 'Room already exists' }, 409))
        if (room.visibility === 'public')
          broadcastWorkspace({
            type: 'room.created',
            room: { ...room, attentionCount: 0, mentionCount: 0 },
          })
        else
          broadcastWorkspaceToUsers(new Set([user.id]), {
            type: 'room.created',
            room: { ...room, attentionCount: 0, mentionCount: 0 },
          })
        return cors(
          json({ room: { ...room, attentionCount: 0, mentionCount: 0 } }, 201),
        )
      }
      const roomRoute = url.pathname.match(/^\/api\/rooms\/([^/]+)$/)
      if (roomRoute && request.method === 'DELETE') {
        const room = options.store.getRoom(roomRoute[1]!)
        if (!room) return cors(json({ error: 'Room not found' }, 404))
        if (!canDeleteRoom(user, room))
          return cors(json({ error: 'Forbidden' }, 403))
        const recipients =
          room.visibility === 'private'
            ? new Set(options.store.listMembers(room.id).map(({ id }) => id))
            : undefined
        const storageKeys = options.store.listAttachmentStorageKeys(room.id)
        options.store.deleteRoom(room.id)
        try {
          await removeAttachmentFiles(attachmentsDirectory, storageKeys)
        } catch (error) {
          console.error(
            'Attachment cleanup orphaned files:',
            room.id,
            storageKeys,
            error,
          )
        }
        const removed = { type: 'room.removed' as const, roomId: room.id }
        if (recipients) broadcastWorkspaceToUsers(recipients, removed)
        else broadcastWorkspace(removed)
        return cors(json({ ok: true }))
      }
      const messages = url.pathname.match(/^\/api\/rooms\/([^/]+)\/messages$/)
      if (messages && request.method === 'GET') {
        const roomId = messages[1]!
        if (!options.store.canAccessRoom(roomId, user.id))
          return cors(json({ error: 'Room not found' }, 404))
        try {
          const page = options.store.listRoomHistoryPage(roomId, {
            limit: roomHistoryPageSize,
            cursor: url.searchParams.get('cursor') ?? undefined,
          })
          return cors(json(page))
        } catch (error) {
          return cors(
            json(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : 'Invalid room history cursor',
              },
              400,
            ),
          )
        }
      }
      if (messages && request.method === 'POST') {
        const roomId = messages[1]!
        if (!options.store.canAccessRoom(roomId, user.id))
          return cors(json({ error: 'Room not found' }, 404))
        const input = await messageInputFrom(request)
        if ('error' in input) return cors(json({ error: input.error }, 400))
        const { text, files } = input
        const mention = /(^|\s)@software-engineer\b\s*/
        const isAgentMessage = mention.test(text)
        const task = isAgentMessage
          ? text.replace(mention, (_, prefix: string) => prefix).trim()
          : undefined
        if (isAgentMessage && !task)
          return cors(json({ error: 'Agent task is required' }, 400))
        if (task && options.agentReady && !options.agentReady())
          return cors(json({ error: 'LLM provider is not configured' }, 409))
        let attachments
        try {
          attachments = await stageAttachments(files, attachmentsDirectory)
        } catch (error) {
          return cors(
            json(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : 'Unable to store attachments',
              },
              400,
            ),
          )
        }
        let message: RoomMessage
        try {
          message = options.messages.postMessage({
            roomId,
            author: { kind: 'user', ...user },
            text,
            attachments,
          })
        } catch (error) {
          try {
            await removeAttachmentFiles(
              attachmentsDirectory,
              attachments.map(({ storageKey }) => storageKey),
            )
          } catch (cleanupError) {
            console.error('Attachment cleanup orphaned files:', cleanupError)
          }
          return cors(json({ error: 'Unable to save message' }, 500))
        }
        if (!task) return cors(json({ message }, 201))
        try {
          const run = options.control.start(task, {
            roomId,
            attachments: attachments.map((attachment) => ({
              type: 'attachment' as const,
              id: attachment.id,
              roomId,
              filename: attachment.filename,
              byteSize: attachment.byteSize,
              sha256: attachment.sha256,
            })),
            onCreate: (source) => {
              const run: RoomRun = {
                ...source,
                roomId,
                triggerMessageId: message.id,
                requestedBy: user,
              }
              options.store.createRun(run)
              return run
            },
          })
          return cors(json({ message, run }, 202))
        } catch (error) {
          return cors(
            json(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : 'Unable to start agent',
                message,
              },
              502,
            ),
          )
        }
      }
      const attachmentRoute = url.pathname.match(
        /^\/api\/attachments\/([^/]+)$/,
      )
      if (attachmentRoute && request.method === 'GET') {
        const attachment = options.store.getAttachment(attachmentRoute[1]!)
        if (
          !attachment ||
          !options.store.canAccessRoom(attachment.roomId, user.id)
        )
          return cors(json({ error: 'Attachment not found' }, 404))
        const bytes = await attachmentBytes(
          attachmentsDirectory,
          attachment.storageKey,
        )
        if (!bytes) return cors(json({ error: 'Attachment not found' }, 404))
        return cors(
          new Response(bytes as unknown as BodyInit, {
            headers: {
              'content-type': attachment.contentType,
              'content-length': String(bytes.byteLength),
              'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
              'x-content-type-options': 'nosniff',
            },
          }),
        )
      }
      const stepsRoute = url.pathname.match(
        /^\/api\/rooms\/([^/]+)\/runs\/([^/]+)\/steps$/,
      )
      if (stepsRoute && request.method === 'GET') {
        const [, roomId, runId] = stepsRoute
        const stored =
          runId && runId.length <= 200 ? options.store.getRun(runId) : undefined
        if (
          !roomId ||
          !options.store.canAccessRoom(roomId, user.id) ||
          !stored ||
          stored.roomId !== roomId
        )
          return cors(json({ error: 'Run not found' }, 404))
        return cors(json({ steps: options.store.listSteps(runId) }))
      }
      const cancellation = url.pathname.match(
        /^\/api\/rooms\/([^/]+)\/runs\/([^/]+)\/cancel$/,
      )
      if (cancellation && request.method === 'POST') {
        const [, roomId, runId] = cancellation
        const stored =
          runId && runId.length <= 200 ? options.store.getRun(runId) : undefined
        if (
          !roomId ||
          !options.store.canAccessRoom(roomId, user.id) ||
          !stored ||
          stored.roomId !== roomId
        )
          return cors(json({ error: 'Run not found' }, 404))
        const run = await options.control.cancel(runId)
        return cors(
          run
            ? json({ run: options.store.getRun(runId) })
            : json({ error: 'Run not found' }, 404),
        )
      }
      if (url.pathname === '/api/workspace/members' && request.method === 'GET')
        return cors(json({ users: options.store.listWorkspaceUsers() }))
      const mentionablesRoute = url.pathname.match(
        /^\/api\/rooms\/([^/]+)\/mentionable-accounts$/,
      )
      if (mentionablesRoute && request.method === 'GET') {
        const roomId = mentionablesRoute[1]!
        if (!options.store.canAccessRoom(roomId, user.id))
          return cors(json({ error: 'Room not found' }, 404))
        return cors(
          json({
            accounts: options.store
              .listMentionableAccounts(roomId)
              .filter(({ id }) => id !== user.id),
          }),
        )
      }
      const acknowledgeRoute = url.pathname.match(
        /^\/api\/rooms\/([^/]+)\/attention\/acknowledge$/,
      )
      if (acknowledgeRoute && request.method === 'POST') {
        const roomId = acknowledgeRoute[1]!
        if (!options.store.canAccessRoom(roomId, user.id))
          return cors(json({ error: 'Room not found' }, 404))
        options.store.acknowledgeRoomAttention(roomId, user.id, Date.now())
        broadcastAttention(user.id, roomId)
        return cors(json({ attentionCount: 0 }))
      }
      const membersRoute = url.pathname.match(
        /^\/api\/rooms\/([^/]+)\/members$/,
      )
      if (membersRoute && request.method === 'GET') {
        const roomId = membersRoute[1]!
        if (!options.store.canAccessRoom(roomId, user.id))
          return cors(json({ error: 'Room not found' }, 404))
        return cors(json({ members: options.store.listMembers(roomId) }))
      }
      if (membersRoute && request.method === 'POST') {
        const roomId = membersRoute[1]!
        if (!options.store.canAccessRoom(roomId, user.id))
          return cors(json({ error: 'Room not found' }, 404))
        const room = options.store.getRoom(roomId)
        if (!room) return cors(json({ error: 'Room not found' }, 404))
        if (room.visibility !== 'private')
          return cors(json({ error: 'Room is not private' }, 400))
        let body: { userId?: unknown } | undefined
        try {
          body = (await request.json()) as { userId?: unknown }
        } catch {
          body = undefined
        }
        const userId =
          body && typeof body.userId === 'string' && body.userId.trim()
            ? body.userId.trim()
            : undefined
        if (!userId) return cors(json({ error: 'Unknown user' }, 400))
        const workspaceUsers = options.store.listWorkspaceUsers()
        if (!workspaceUsers.some((u) => u.id === userId))
          return cors(json({ error: 'Unknown user' }, 400))
        options.store.addMember(roomId, userId, user.id)
        const updatedRoom = options.store.getRoom(roomId)!
        broadcastWorkspaceToUsers(new Set([userId]), {
          type: 'room.created',
          room: { ...updatedRoom, attentionCount: 0, mentionCount: 0 },
        })
        broadcastRoom(roomId, { type: 'room.members.changed', roomId })
        return cors(json({ members: options.store.listMembers(roomId) }, 201))
      }
      const memberRoute = url.pathname.match(
        /^\/api\/rooms\/([^/]+)\/members\/([^/]+)$/,
      )
      if (memberRoute && request.method === 'DELETE') {
        const roomId = memberRoute[1]!
        const targetUserId = memberRoute[2]!
        if (!options.store.canAccessRoom(roomId, user.id))
          return cors(json({ error: 'Room not found' }, 404))
        const room = options.store.getRoom(roomId)
        if (!room) return cors(json({ error: 'Room not found' }, 404))
        if (room.visibility !== 'private')
          return cors(json({ error: 'Room is not private' }, 400))
        if (targetUserId !== user.id && !options.store.isOwner(roomId, user.id))
          return cors(
            json({ error: 'Only the room owner can remove members' }, 403),
          )
        options.store.removeMember(roomId, targetUserId)
        broadcastWorkspaceToUsers(new Set([targetUserId]), {
          type: 'room.removed',
          roomId,
        })
        broadcastRoom(roomId, { type: 'room.members.changed', roomId })
        return cors(json({ ok: true }))
      }
      return cors(json({ error: 'Not found' }, 404))
    },
    websocket: {
      open(socket) {
        sockets.add(socket)
        sendSnapshot(socket)
      },
      message(socket, message) {
        if (message.toString() === 'snapshot') sendSnapshot(socket)
      },
      close(socket) {
        sockets.delete(socket)
      },
    },
  })
  return {
    port: server.port,
    stop: () => {
      unsubscribe()
      unsubscribeMessages()
      unsubscribeSteps()
      if (scheduleInterval) clearInterval(scheduleInterval)
      scheduleRunner?.stop()
      server.stop(true)
    },
  }
}

if (import.meta.main) {
  const sandboxProviderName = parseSandboxProvider(
    process.env.SWEAT_SANDBOX_PROVIDER,
  )
  const { fileURLToPath } = await import('node:url')
  // Load the database first: auth and the session authenticator both depend on it.
  const { migrateDatabase, sqlite } = await import('../lib/database')
  await migrateDatabase(
    fileURLToPath(new URL('../../drizzle', import.meta.url)),
  )
  const [
    { auth },
    { betterAuthSessionAuthenticator },
    { createAdmissionStore },
    { createWorkspaceLlmConfig },
    { createSoftwareEngineerExecutor },
    {
      createGitHubSoftwareEngineerAdapter,
      createLinearSoftwareEngineerAdapter,
      createWorkspaceSoftwareEngineerAdapter,
    },
    { createGitHubCliClient },
    { createMcpGatewayHttpServer },
    { agentParticipant },
    { createAppleContainerClient },
    { createAppleContainerSandboxProvider },
    { createDockerSandboxProvider },
  ] = await Promise.all([
    import('../lib/auth'),
    import('./session-auth'),
    import('./admission'),
    import('./llm-config'),
    import('../../../agents/software-engineer'),
    import('../../../agents/software-engineer-adapters'),
    import('../../../mcp/github'),
    import('../../../mcp/http'),
    import('./room-store'),
    import('../../../sdk/src'),
    import('../../../providers/apple-container-sandbox'),
    import('../../../providers/docker-sandbox'),
  ])
  const admissionStore = createAdmissionStore(sqlite)
  const llm = createWorkspaceLlmConfig(sqlite)
  const authContext = await auth.$context
  const store = createSqliteRoomStore(sqlite)
  const scheduleStore = createSqliteScheduleStore(sqlite)
  const messages = createRoomMessageHub(store)
  const attachmentsDirectory = attachmentDirectory(
    process.env.SWEAT_DATABASE_PATH ?? './sweat.sqlite',
  )
  const linearAccessToken = process.env.LINEAR_MCP_API_KEY
  const githubRepository = process.env.SWEAT_GITHUB_REPOSITORY
  const githubBase = process.env.SWEAT_GITHUB_BASE ?? 'main'
  const github = githubRepository ? await createGitHubCliClient() : undefined
  const capabilityUrl = (u: string): string =>
    u.replace(
      'http://0.0.0.0',
      process.env.SWEAT_MCP_HOST ?? 'http://host.container.internal',
    )
  const sandboxProvider =
    sandboxProviderName === 'docker'
      ? createDockerSandboxProvider()
      : createAppleContainerSandboxProvider({
          container: createAppleContainerClient(),
        })
  const control = createRunControl(
    createSoftwareEngineerExecutor({
      sandboxProvider,
      image: process.env.SWEAT_AGENT_IMAGE,
      model: () => llm.model(),
      attachmentSource: createRoomAttachmentSource({
        store,
        directory: attachmentsDirectory,
      }),
      adapters: [
        createWorkspaceSoftwareEngineerAdapter({
          port: {
            listMessages: (id) =>
              messages
                .listMessages(id)
                .map(({ attachments: _, ...message }) => message),
            postMessage: (input) => {
              messages.postMessage(input)
            },
          },
          agent: agentParticipant('software-engineer'),
        }),
        ...(linearAccessToken
          ? [
              createLinearSoftwareEngineerAdapter({
                accessToken: linearAccessToken,
              }),
            ]
          : []),
        ...(github && githubRepository
          ? [
              createGitHubSoftwareEngineerAdapter({
                octokit: github,
                repository: githubRepository,
                base: githubBase,
                verifyCommand: process.env.SWEAT_VERIFY_COMMAND,
              }),
            ]
          : []),
      ],
      createCapabilityEndpoint: (gateway) => {
        const server = createMcpGatewayHttpServer({
          gateway,
          hostname: '0.0.0.0',
        })
        return { url: capabilityUrl(server.url), close: server.close }
      },
    }),
  )
  const coordinator = createCoordinator({
    control,
    store,
    messages,
    authenticator: betterAuthSessionAuthenticator,
    authHandler: (request) => auth.handler(request),
    origin: process.env.SWEAT_GUI_ORIGIN ?? 'tauri://localhost',
    attachmentDirectory: attachmentsDirectory,
    port: Number(process.env.SWEAT_COORDINATOR_PORT ?? 3001),
    scheduleStore,
    admission: {
      store: admissionStore,
      llm,
      listUsers: () => authContext.internalAdapter.listUsers(100),
      banUser: (request, userId) =>
        auth.api.banUser({ body: { userId }, headers: request.headers }),
      unbanUser: (request, userId) =>
        auth.api.unbanUser({ body: { userId }, headers: request.headers }),
      createAccount: async (body, role) => {
        const created = await auth.api.createUser({
          body: {
            email: body.email,
            password: body.password,
            name: body.name,
            role,
            data: {
              username: body.username,
              displayUsername: body.username,
            },
          },
          asResponse: true,
        })
        if (!created.ok) return created
        const signedIn = await auth.api.signInEmail({
          body: { email: body.email, password: body.password },
          asResponse: true,
        })
        return signedIn.ok ? signedIn : created
      },
    },
    agentReady: () => llm.public().configured,
  })
  process.stdout.write(`Coordinator listening on ${coordinator.port}\n`)
  const setupToken = admissionStore.ensureSetupToken()
  if (setupToken) process.stdout.write(`Sweat setup token: ${setupToken}\n`)
}
