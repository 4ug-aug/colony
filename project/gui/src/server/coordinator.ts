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
      latestSteps: StoredStep[]
    }
  | { type: 'message.created'; message: RoomMessage }
  | { type: 'run.changed'; run: RoomRun }
  | { type: 'run.step'; runId: string; step: StoredStep }
  | { type: 'room.members.changed'; roomId: string }
export type WorkspaceRoom = RoomSummary & { attentionCount: number }
export type WorkspaceServerMessage =
  | { type: 'workspace.snapshot'; rooms: WorkspaceRoom[] }
  | { type: 'room.created'; room: WorkspaceRoom }
  | { type: 'room.removed'; roomId: string }
  | {
      type: 'attention.changed'
      roomId: string
      roomName: string
      attentionCount: number
      kind?: 'mention' | 'run_terminal'
    }
export type ServerMessage = RoomServerMessage | WorkspaceServerMessage

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
  port?: number
  admission?: AdmissionOptions
  agentReady?: () => boolean
}) {
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
    return options.store.listRoomsForUser(userId).map((room) => ({
      ...room,
      attentionCount: counts.get(room.id) ?? 0,
    }))
  }
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
  const broadcastAttention = (
    userId: string,
    roomId: string,
    kind?: 'mention' | 'run_terminal',
  ): void => {
    const attentionCount =
      options.store.listAttentionCounts(userId).get(roomId) ?? 0
    broadcastWorkspaceToUsers(new Set([userId]), {
      type: 'attention.changed',
      roomId,
      roomName: options.store.getRoom(roomId)?.name ?? 'Room',
      attentionCount,
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
    send(socket, {
      type: 'room.snapshot',
      room: {
        ...room,
        attentionCount:
          options.store
            .listAttentionCounts(socket.data.userId)
            .get(room.id) ?? 0,
      },
      messages: options.messages.listMessages(socket.data.roomId),
      runs: options.store.listRuns(socket.data.roomId),
      latestSteps: [
        ...options.store
          .latestStepsForActiveRuns(socket.data.roomId)
          .values(),
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
              'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
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
            room: { ...room, attentionCount: 0 },
          })
        else
          broadcastWorkspaceToUsers(new Set([user.id]), {
            type: 'room.created',
            room: { ...room, attentionCount: 0 },
          })
        return cors(json({ room: { ...room, attentionCount: 0 } }, 201))
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
        options.store.deleteRoom(room.id)
        const removed = { type: 'room.removed' as const, roomId: room.id }
        if (recipients) broadcastWorkspaceToUsers(recipients, removed)
        else broadcastWorkspace(removed)
        return cors(json({ ok: true }))
      }
      const messages = url.pathname.match(/^\/api\/rooms\/([^/]+)\/messages$/)
      if (messages && request.method === 'POST') {
        const roomId = messages[1]!
        if (!options.store.canAccessRoom(roomId, user.id))
          return cors(json({ error: 'Room not found' }, 404))
        const text = await textFrom(request)
        if (!text) return cors(json({ error: 'Invalid message' }, 400))
        const mention = /(^|\s)@software-engineer\b\s*/
        const task = mention.test(text)
          ? text.replace(mention, (_, prefix: string) => prefix).trim()
          : undefined
        if (mention.test(text) && !task)
          return cors(json({ error: 'Agent task is required' }, 400))
        if (task && options.agentReady && !options.agentReady())
          return cors(json({ error: 'LLM provider is not configured' }, 409))
        const message = options.messages.postMessage({
          roomId,
          author: { kind: 'user', ...user },
          text,
        })
        if (!task) return cors(json({ message }, 201))
        try {
          const run = options.control.start(task, {
            roomId,
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
          room: { ...updatedRoom, attentionCount: 0 },
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
      server.stop(true)
    },
  }
}

if (import.meta.main) {
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
  ])
  const admissionStore = createAdmissionStore(sqlite)
  const llm = createWorkspaceLlmConfig(sqlite)
  const authContext = await auth.$context
  const store = createSqliteRoomStore(sqlite)
  const messages = createRoomMessageHub(store)
  const linearAccessToken = process.env.LINEAR_MCP_API_KEY
  const githubRepository = process.env.SWEAT_GITHUB_REPOSITORY
  const githubBase = process.env.SWEAT_GITHUB_BASE ?? 'main'
  const github = githubRepository ? await createGitHubCliClient() : undefined
  const capabilityUrl = (u: string): string =>
    u.replace(
      'http://0.0.0.0',
      process.env.SWEAT_MCP_HOST ?? 'http://host.container.internal',
    )
  const control = createRunControl(
    createSoftwareEngineerExecutor({
      image: process.env.SWEAT_AGENT_IMAGE,
      model: () => llm.model(),
      adapters: [
        createWorkspaceSoftwareEngineerAdapter({
          port: {
            listMessages: (id) => messages.listMessages(id),
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
    origin: process.env.SWEAT_GUI_ORIGIN ?? 'http://localhost:3000',
    port: Number(process.env.SWEAT_COORDINATOR_PORT ?? 3001),
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
