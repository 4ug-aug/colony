import type { ServerWebSocket } from 'bun'
import { createRunControl, type RunControl } from './run-control'
import {
  createSqliteRoomStore,
  type RoomMessage,
  type RoomRun,
  type RoomStore,
  type RoomUser,
} from './room-store'
import { createRoomMessageHub, type RoomMessageHub } from './room-hub'

export interface SessionAuthenticator {
  authenticate(request: Request): Promise<RoomUser | undefined>
}

export type ServerMessage =
  | {
      type: 'room.snapshot'
      room: ReturnType<RoomStore['listRooms']>[number]
      messages: RoomMessage[]
      runs: RoomRun[]
    }
  | { type: 'message.created'; message: RoomMessage }
  | { type: 'run.changed'; run: RoomRun }
  | { type: 'room.created'; room: ReturnType<RoomStore['listRooms']>[number] }

const send = (
  socket: ServerWebSocket<{ roomId: string }>,
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
const allowedOrigin = (
  origin: string | null,
  configured: string,
): string | undefined => {
  if (origin === configured) return origin
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
async function roomNameFrom(request: Request): Promise<string | undefined> {
  try {
    const body: unknown = await request.json()
    const name =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).name
        : undefined
    if (typeof name !== 'string') return undefined
    const trimmed = name.trim()
    return trimmed.length >= 1 && trimmed.length <= 50 ? trimmed : undefined
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
}) {
  const sockets = new Set<ServerWebSocket<{ roomId: string }>>()
  const broadcast = (message: ServerMessage): void => {
    for (const socket of sockets) send(socket, message)
  }
  const broadcastRoom = (roomId: string, message: ServerMessage): void => {
    for (const socket of sockets)
      if (socket.data.roomId === roomId) send(socket, message)
  }
  const project = (run: ReturnType<RunControl['listRuns']>[number]): void => {
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
  options.store
    .failStaleRuns()
    .forEach((run) => broadcastRoom(run.roomId, { type: 'run.changed', run }))
  const server = Bun.serve<{ roomId: string }>({
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
              'access-control-allow-headers': 'content-type',
              'access-control-allow-methods': 'GET, POST, OPTIONS',
            },
          }),
        )
      if (url.pathname.startsWith('/api/auth/'))
        return cors(await options.authHandler(request))
      const user = await options.authenticator.authenticate(request)
      if (!user) return cors(json({ error: 'Unauthorized' }, 401))
      const stream = url.pathname.match(/^\/api\/rooms\/([^/]+)\/stream$/)
      if (
        stream &&
        request.headers.get('upgrade')?.toLowerCase() === 'websocket'
      ) {
        const roomId = stream[1]!
        if (!options.store.getRoom(roomId))
          return cors(json({ error: 'Room not found' }, 404))
        return server.upgrade(request, { data: { roomId } })
          ? undefined
          : json({ error: 'Upgrade failed' }, 400)
      }
      if (url.pathname === '/api/rooms' && request.method === 'GET')
        return cors(json({ rooms: options.store.listRooms() }))
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const name = await roomNameFrom(request)
        if (!name) return cors(json({ error: 'Invalid room name' }, 400))
        const room = { id: crypto.randomUUID(), name }
        if (!options.store.createRoom(room))
          return cors(json({ error: 'Room already exists' }, 409))
        broadcast({ type: 'room.created', room })
        return cors(json({ room }, 201))
      }
      const messages = url.pathname.match(/^\/api\/rooms\/([^/]+)\/messages$/)
      if (messages && request.method === 'POST') {
        const roomId = messages[1]!
        if (!options.store.getRoom(roomId))
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
          const runId = options.control.start(task, { roomId })
          const source = options.control
            .listRuns()
            .find((run) => run.id === runId)
          if (!source) throw new Error('Agent run was not created')
          const run: RoomRun = {
            ...source,
            roomId,
            triggerMessageId: message.id,
            requestedBy: user,
          }
          options.store.createRun(run)
          broadcastRoom(roomId, { type: 'run.changed', run })
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
      const cancellation = url.pathname.match(
        /^\/api\/rooms\/([^/]+)\/runs\/([^/]+)\/cancel$/,
      )
      if (cancellation && request.method === 'POST') {
        const [, roomId, runId] = cancellation
        const stored =
          runId && runId.length <= 200 ? options.store.getRun(runId) : undefined
        if (
          !roomId ||
          !options.store.getRoom(roomId) ||
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
  // Load the database first: auth and the session authenticator both depend on it.
  const { sqlite } = await import('../lib/database')
  const [
    { auth },
    { betterAuthSessionAuthenticator },
    { createSoftwareEngineerExecutor },
    { softwareEngineerRole },
    { createMcpGateway },
    { createMcpGatewayHttpServer },
    { createCapabilitySessionFactory },
    { createWorkspaceMcpUpstream },
    { agentParticipant },
  ] = await Promise.all([
    import('../lib/auth'),
    import('./session-auth'),
    import('../../../composition/software-engineer'),
    import('../../../roles/software-engineer'),
    import('../../../mcp/gateway'),
    import('../../../mcp/http'),
    import('../../../mcp/session'),
    import('../../../mcp/workspace'),
    import('./room-store'),
  ])
  const store = createSqliteRoomStore(sqlite)
  const messages = createRoomMessageHub(store)
  const workspaceTools =
    softwareEngineerRole.requestedCapabilities.find((c) => c.id === 'workspace.room')?.tools ?? []
  const capabilityUrl = (u: string): string =>
    u.replace('http://0.0.0.0', process.env.SWEAT_MCP_HOST ?? 'http://host.container.internal')
  const capabilities = workspaceTools.length
    ? createCapabilitySessionFactory({
        createGateway: ({ grantContext }) => {
          const roomId = (grantContext as { roomId?: string } | undefined)?.roomId
          if (!roomId) throw new Error('A room id is required for the workspace capability')
          return createMcpGateway({
            upstream: createWorkspaceMcpUpstream({
              port: {
                listMessages: (id) => messages.listMessages(id),
                postMessage: (input) => { messages.postMessage(input) },
              },
              roomId,
              agent: agentParticipant('software-engineer'),
            }),
          })
        },
        createEndpoint: (gateway) => {
          const server = createMcpGatewayHttpServer({ gateway, hostname: '0.0.0.0' })
          return { url: capabilityUrl(server.url), close: server.close }
        },
      })
    : undefined
  const control = createRunControl(
    createSoftwareEngineerExecutor({
      image: process.env.SWEAT_AGENT_IMAGE,
      model: {
        baseUrl: required('LLM_BASE_URL'),
        apiKey: required('LLM_API_KEY'),
        model: required('LLM_MODEL'),
      },
      ...(capabilities ? { capabilities } : {}),
    }),
    { workspaceCapability: { tools: workspaceTools } },
  )
  const coordinator = createCoordinator({
    control,
    store,
    messages,
    authenticator: betterAuthSessionAuthenticator,
    authHandler: (request) => auth.handler(request),
    origin: process.env.SWEAT_GUI_ORIGIN ?? 'http://localhost:3000',
    port: Number(process.env.SWEAT_COORDINATOR_PORT ?? 3001),
  })
  process.stdout.write(`Coordinator listening on ${coordinator.port}\n`)
}
