import type { ServerWebSocket } from 'bun'
import { createRunControl, type RunControl } from './run-control'
import {
  createSqliteRoomStore,
  GENERAL_ROOM_ID,
  type RoomMessage,
  type RoomRun,
  type RoomStore,
  type RoomUser,
} from './room-store'

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

const send = (
  socket: ServerWebSocket<unknown>,
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
const allowedOrigin = (origin: string | null, configured: string): string | undefined => {
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

export function createCoordinator(options: {
  control: RunControl
  store: RoomStore
  authenticator: SessionAuthenticator
  authHandler: (request: Request) => Promise<Response>
  origin: string
  port?: number
}) {
  const sockets = new Set<ServerWebSocket<unknown>>()
  const broadcast = (message: ServerMessage): void => {
    for (const socket of sockets) send(socket, message)
  }
  const project = (run: ReturnType<RunControl['listRuns']>[number]): void => {
    const saved = options.store.getRun(run.id)
    if (!saved) return
    const changed = { ...saved, ...run }
    options.store.updateRun(changed)
    broadcast({ type: 'run.changed', run: changed })
  }
  const unsubscribe = options.control.subscribe(project)
  options.store
    .failStaleRuns()
    .forEach((run) => broadcast({ type: 'run.changed', run }))
  const server = Bun.serve({
    port: options.port ?? 3001,
    async fetch(request, server) {
      const url = new URL(request.url)
      const origin = allowedOrigin(request.headers.get('origin'), options.origin)
      const cors = (response: Response): Response =>
        withCors(response, origin!)
      if (!origin)
        return json({ error: 'Forbidden' }, 403)
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
      if (
        url.pathname === `/api/rooms/${GENERAL_ROOM_ID}/stream` &&
        request.headers.get('upgrade')?.toLowerCase() === 'websocket'
      )
        return server.upgrade(request)
          ? undefined
          : json({ error: 'Upgrade failed' }, 400)
      if (url.pathname === '/api/rooms' && request.method === 'GET')
        return cors(json({ rooms: options.store.listRooms() }))
      if (
        url.pathname === `/api/rooms/${GENERAL_ROOM_ID}/messages` &&
        request.method === 'POST'
      ) {
        const text = await textFrom(request)
        if (!text) return cors(json({ error: 'Invalid message' }, 400))
        const prefix = '@software-engineer '
        const task = text.startsWith(prefix)
          ? text.slice(prefix.length).trim()
          : undefined
        if (text === '@software-engineer' || (text.startsWith(prefix) && !task))
          return cors(json({ error: 'Agent task is required' }, 400))
        const message: RoomMessage = {
          id: crypto.randomUUID(),
          roomId: GENERAL_ROOM_ID,
          author: user,
          text,
          createdAt: Date.now(),
        }
        options.store.createMessage(message)
        broadcast({ type: 'message.created', message })
        if (!task) return cors(json({ message }, 201))
        try {
          const runId = options.control.start(task)
          const source = options.control
            .listRuns()
            .find((run) => run.id === runId)
          if (!source) throw new Error('Agent run was not created')
          const run: RoomRun = {
            ...source,
            roomId: GENERAL_ROOM_ID,
            triggerMessageId: message.id,
            requestedBy: user,
          }
          options.store.createRun(run)
          broadcast({ type: 'run.changed', run })
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
        new RegExp(`^/api/rooms/${GENERAL_ROOM_ID}/runs/([^/]+)/cancel$`),
      )
      if (cancellation && request.method === 'POST') {
        const runId = cancellation[1]
        if (!runId || runId.length > 200 || !options.store.getRun(runId))
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
        send(socket, {
          type: 'room.snapshot',
          room: options.store.listRooms()[0]!,
          messages: options.store.listMessages(),
          runs: options.store.listRuns(),
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
  ] = await Promise.all([
    import('../lib/auth'),
    import('./session-auth'),
    import('../../../composition/software-engineer'),
  ])
  const control = createRunControl(
    createSoftwareEngineerExecutor({
      image: process.env.SWEAT_AGENT_IMAGE,
      model: {
        baseUrl: required('LLM_BASE_URL'),
        apiKey: required('LLM_API_KEY'),
        model: required('LLM_MODEL'),
      },
    }),
  )
  const coordinator = createCoordinator({
    control,
    store: createSqliteRoomStore(sqlite),
    authenticator: betterAuthSessionAuthenticator,
    authHandler: (request) => auth.handler(request),
    origin: process.env.SWEAT_GUI_ORIGIN ?? 'http://localhost:3000',
    port: Number(process.env.SWEAT_COORDINATOR_PORT ?? 3001),
  })
  process.stdout.write(`Coordinator listening on ${coordinator.port}\n`)
}
