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

export type ServerMessage =
  | {
      type: 'room.snapshot'
      room: ReturnType<RoomStore['listRooms']>[number]
      messages: RoomMessage[]
      runs: RoomRun[]
      latestSteps: StoredStep[]
    }
  | { type: 'message.created'; message: RoomMessage }
  | { type: 'run.changed'; run: RoomRun }
  | { type: 'room.created'; room: ReturnType<RoomStore['listRooms']>[number] }
  | { type: 'run.step'; runId: string; step: StoredStep }
  | { type: 'room.removed'; roomId: string }
  | { type: 'room.members.changed'; roomId: string }

const send = (
  socket: ServerWebSocket<{ roomId: string; userId: string }>,
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
}) {
  const sockets = new Set<ServerWebSocket<{ roomId: string; userId: string }>>()
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
  const broadcast = (message: ServerMessage): void => {
    for (const socket of sockets) send(socket, message)
  }
  const broadcastRoom = (roomId: string, message: ServerMessage): void => {
    for (const socket of sockets)
      if (socket.data.roomId === roomId) send(socket, message)
  }
  const broadcastToUsers = (
    userIds: Set<string>,
    message: ServerMessage,
  ): void => {
    for (const socket of sockets)
      if (userIds.has(socket.data.userId)) send(socket, message)
  }
  const project = (run: RunSummary): void => {
    const saved = options.store.getRun(run.id)
    if (!saved) return
    const changed = { ...saved, ...run }
    options.store.updateRun(changed)
    broadcastRoom(changed.roomId, { type: 'run.changed', run: changed })
  }
  const unsubscribe = options.control.subscribe(project)
  const unsubscribeMessages = options.messages.subscribe((event) =>
    broadcastRoom(event.message.roomId, event),
  )
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
  options.store
    .failStaleRuns()
    .forEach((run) => broadcastRoom(run.roomId, { type: 'run.changed', run }))
  const server = Bun.serve<{ roomId: string; userId: string }>({
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
      if (
        stream &&
        request.headers.get('upgrade')?.toLowerCase() === 'websocket'
      ) {
        const roomId = stream[1]!
        // Authenticate the upgrade by realtime ticket (desktop) or session (browser).
        const ticket = url.searchParams.get('ticket')
        const userId =
          (ticket ? verifyRealtimeTicket(ticket) : undefined) ??
          (await options.authenticator.authenticate(request))?.id
        if (!userId) return cors(json({ error: 'Unauthorized' }, 401))
        if (!options.store.canAccessRoom(roomId, userId))
          return cors(json({ error: 'Room not found' }, 404))
        return server.upgrade(request, { data: { roomId, userId } })
          ? undefined
          : json({ error: 'Upgrade failed' }, 400)
      }
      const user = await options.authenticator.authenticate(request)
      if (!user) return cors(json({ error: 'Unauthorized' }, 401))
      if (url.pathname === '/api/realtime-ticket' && request.method === 'GET')
        return cors(json({ ticket: mintRealtimeTicket(user.id) }))
      if (url.pathname === '/api/rooms' && request.method === 'GET')
        return cors(json({ rooms: options.store.listRoomsForUser(user.id) }))
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
        if (room.visibility === 'public') {
          broadcast({ type: 'room.created', room })
        }
        // private rooms are delivered to members in B2
        return cors(json({ room }, 201))
      }
      const roomRoute = url.pathname.match(/^\/api\/rooms\/([^/]+)$/)
      if (roomRoute && request.method === 'DELETE') {
        const room = options.store.getRoom(roomRoute[1]!)
        if (!room) return cors(json({ error: 'Room not found' }, 404))
        if (!canDeleteRoom(user, room))
          return cors(json({ error: 'Forbidden' }, 403))
        options.store.deleteRoom(room.id)
        broadcast({ type: 'room.removed', roomId: room.id })
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
        broadcastToUsers(new Set([userId]), {
          type: 'room.created',
          room: updatedRoom,
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
        broadcastToUsers(new Set([targetUserId]), {
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
        const room = options.store.getRoom(socket.data.roomId)
        if (!room) return socket.close()
        send(socket, {
          type: 'room.snapshot',
          room,
          messages: options.messages.listMessages(socket.data.roomId),
          runs: options.store.listRuns(socket.data.roomId),
          latestSteps: [
            ...options.store
              .latestStepsForActiveRuns(socket.data.roomId)
              .values(),
          ],
        })
      },
      message() {},
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

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
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
    import('../../../agents/software-engineer'),
    import('../../../agents/software-engineer-adapters'),
    import('../../../mcp/github'),
    import('../../../mcp/http'),
    import('./room-store'),
  ])
  const admissionStore = createAdmissionStore(sqlite)
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
      model: {
        baseUrl: required('LLM_BASE_URL'),
        apiKey: required('LLM_API_KEY'),
        model: required('LLM_MODEL'),
      },
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
  })
  process.stdout.write(`Coordinator listening on ${coordinator.port}\n`)
  const setupToken = admissionStore.ensureSetupToken()
  if (setupToken) process.stdout.write(`Sweat setup token: ${setupToken}\n`)
}
