import type { WorkspaceServerMessage } from './coordinator'
import type { BulletinStore } from './bulletin-store'
import { clampNormalized } from './bulletin-store'
import type { RoomUser } from './room-store'
import { json, readBody } from './http/respond'

const maxBodyLength = 10_000

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

    const route = url.pathname.match(/^\/api\/bulletins\/([^/]+)$/)
    if (!route) return undefined
    const id = route[1]!

    if (request.method === 'PATCH') {
      const current = deps.bulletinStore.getBulletin(id)
      if (!current) return json({ error: 'Bulletin not found' }, 404)
      const body = await readBody(request)
      if (!body) return json({ error: 'Invalid bulletin' }, 400)
      const patch: { body?: string; x?: number; y?: number } = {}
      if (body.body !== undefined) {
        if (typeof body.body !== 'string')
          return json({ error: 'Invalid bulletin body' }, 400)
        if (body.body.length > maxBodyLength)
          return json({ error: 'Bulletin body too long' }, 400)
        patch.body = body.body
      }
      const position = readPosition(body)
      if (position.error) return json({ error: position.error }, 400)
      if (position.x !== undefined) patch.x = position.x
      if (position.y !== undefined) patch.y = position.y
      if (
        patch.body === undefined &&
        patch.x === undefined &&
        patch.y === undefined
      )
        return json({ error: 'Nothing to update' }, 400)
      const bulletin = deps.bulletinStore.updateBulletin(id, patch, Date.now())
      if (!bulletin) return json({ error: 'Bulletin not found' }, 404)
      const movedOnly =
        patch.body === undefined &&
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
