import type { WorkspaceServerMessage } from './coordinator'
import type { BulletinStore, Poll } from './bulletin-store'
import { clampNormalized } from './bulletin-store'
import type { RoomUser } from './room-store'
import { json, readBody } from './http/respond'

const maxBodyLength = 10_000
const maxOptionLength = 200
const minPollOptions = 2
const maxPollOptions = 8

function readPoll(
  value: unknown,
  votes: Record<string, number[]>,
): { poll?: Poll | null; error?: string } {
  if (value === null) return { poll: null }
  if (typeof value !== 'object' || Array.isArray(value))
    return { error: 'Invalid poll' }
  const input = value as { options?: unknown; multi?: unknown }
  if (!Array.isArray(input.options)) return { error: 'Invalid poll options' }
  if (input.options.some((option) => typeof option !== 'string'))
    return { error: 'Invalid poll options' }
  const options = (input.options as string[])
    .map((option) => option.trim().slice(0, maxOptionLength))
    .filter(Boolean)
  if (options.length < minPollOptions || options.length > maxPollOptions)
    return { error: `Polls need ${minPollOptions}-${maxPollOptions} options` }
  if (input.multi !== undefined && typeof input.multi !== 'boolean')
    return { error: 'Invalid poll' }
  // Votes are never taken from the client — only the vote route can change them.
  // Existing votes are carried over, dropping any the edited options invalidate.
  const kept = Object.fromEntries(
    Object.entries(votes).flatMap(([userId, chosen]) => {
      const valid = chosen.filter((index) => index < options.length)
      const limited = input.multi ? valid : valid.slice(0, 1)
      return limited.length ? [[userId, limited] as const] : []
    }),
  )
  return {
    poll: {
      ...(input.multi ? { multi: true } : {}),
      options,
      votes: kept,
    },
  }
}

function readVote(value: unknown, poll: Poll): number[] | null | undefined {
  if (value === null) return null
  if (!Array.isArray(value)) return undefined
  const chosen = [...new Set(value)]
  if (
    chosen.some(
      (index) =>
        !Number.isInteger(index) || index < 0 || index >= poll.options.length,
    )
  )
    return undefined
  const limited = poll.multi ? chosen : chosen.slice(0, 1)
  return limited.length ? (limited as number[]) : null
}

function readPosition(body: Record<string, unknown>): {
  x?: number
  y?: number
  error?: string
} {
  const hasX = body.x !== undefined
  const hasY = body.y !== undefined
  if (!hasX && !hasY) return {}
  if (
    (hasX && typeof body.x !== 'number') ||
    (hasY && typeof body.y !== 'number')
  )
    return { error: 'Invalid bulletin position' }
  return {
    ...(hasX ? { x: clampNormalized(body.x as number) } : {}),
    ...(hasY ? { y: clampNormalized(body.y as number) } : {}),
  }
}

export function createBulletinsHttp(deps: {
  bulletinStore: BulletinStore
  broadcastWorkspace: (message: WorkspaceServerMessage) => void
}): (
  request: Request,
  url: URL,
  user: RoomUser,
) => Promise<Response | undefined> {
  return async (
    request: Request,
    url: URL,
    user: RoomUser,
  ): Promise<Response | undefined> => {
    if (url.pathname === '/api/bulletins' && request.method === 'GET')
      return json({ bulletins: deps.bulletinStore.listBulletins() })

    if (url.pathname === '/api/bulletins' && request.method === 'POST') {
      const body = await readBody(request)
      if (!body) return json({ error: 'Invalid bulletin' }, 400)
      const text = typeof body.body === 'string' ? body.body : ''
      if (text.length > maxBodyLength)
        return json({ error: 'Bulletin body too long' }, 400)
      const position = readPosition(body)
      if (position.error) return json({ error: position.error }, 400)
      const now = Date.now()
      const bulletin = deps.bulletinStore.createBulletin({
        id: crypto.randomUUID(),
        body: text,
        x: position.x ?? 0.5,
        y: position.y ?? 0.5,
        createdBy: user.id,
        createdAt: now,
      })
      deps.broadcastWorkspace({ type: 'bulletin.created', bulletin })
      return json({ bulletin }, 201)
    }

    const voteRoute = url.pathname.match(/^\/api\/bulletins\/([^/]+)\/vote$/)
    if (voteRoute && request.method === 'POST') {
      const current = deps.bulletinStore.getBulletin(voteRoute[1]!)
      if (!current) return json({ error: 'Bulletin not found' }, 404)
      if (!current.poll) return json({ error: 'Bulletin has no poll' }, 400)
      const body = await readBody(request)
      if (!body) return json({ error: 'Invalid vote' }, 400)
      const chosen = readVote(body.options, current.poll)
      if (chosen === undefined) return json({ error: 'Invalid vote' }, 400)
      const bulletin = deps.bulletinStore.voteBulletin(
        current.id,
        user.id,
        chosen,
        Date.now(),
      )
      if (!bulletin) return json({ error: 'Bulletin not found' }, 404)
      deps.broadcastWorkspace({ type: 'bulletin.changed', bulletin })
      return json({ bulletin })
    }

    const route = url.pathname.match(/^\/api\/bulletins\/([^/]+)$/)
    if (!route) return undefined
    const id = route[1]!

    if (request.method === 'PATCH') {
      const current = deps.bulletinStore.getBulletin(id)
      if (!current) return json({ error: 'Bulletin not found' }, 404)
      const body = await readBody(request)
      if (!body) return json({ error: 'Invalid bulletin' }, 400)
      const patch: {
        body?: string
        x?: number
        y?: number
        poll?: Poll | null
      } = {}
      if (body.body !== undefined) {
        if (typeof body.body !== 'string')
          return json({ error: 'Invalid bulletin body' }, 400)
        if (body.body.length > maxBodyLength)
          return json({ error: 'Bulletin body too long' }, 400)
        patch.body = body.body
      }
      if (body.poll !== undefined) {
        const poll = readPoll(body.poll, current.poll?.votes ?? {})
        if (poll.error) return json({ error: poll.error }, 400)
        patch.poll = poll.poll ?? null
      }
      const position = readPosition(body)
      if (position.error) return json({ error: position.error }, 400)
      if (position.x !== undefined) patch.x = position.x
      if (position.y !== undefined) patch.y = position.y
      if (
        patch.body === undefined &&
        patch.poll === undefined &&
        patch.x === undefined &&
        patch.y === undefined
      )
        return json({ error: 'Nothing to update' }, 400)
      const bulletin = deps.bulletinStore.updateBulletin(id, patch, Date.now())
      if (!bulletin) return json({ error: 'Bulletin not found' }, 404)
      const movedOnly =
        patch.body === undefined &&
        patch.poll === undefined &&
        (patch.x !== undefined || patch.y !== undefined)
      deps.broadcastWorkspace(
        movedOnly
          ? { type: 'bulletin.moved', bulletin }
          : { type: 'bulletin.changed', bulletin },
      )
      return json({ bulletin })
    }

    if (request.method === 'DELETE') {
      const deleted = deps.bulletinStore.deleteBulletin(id)
      if (!deleted) return json({ error: 'Bulletin not found' }, 404)
      deps.broadcastWorkspace({ type: 'bulletin.deleted', bulletinId: id })
      return json({ ok: true })
    }

    return undefined
  }
}
