import type { GrillStore, GrillKind, GrillVisibility } from './grill-store'
import type { RoomUser } from './room-store'
import { json, readBody } from './http/respond'

const kinds = new Set<GrillKind>(['code', 'general'])
const visibilities = new Set<GrillVisibility>(['invite-only', 'workspace-open'])

export function createGrillsHttp(deps: {
  grillStore: GrillStore
}): (
  request: Request,
  url: URL,
  user: RoomUser,
) => Promise<Response | undefined> {
  return async (request, url, user) => {
    if (url.pathname === '/api/grills' && request.method === 'GET')
      return json({ grills: deps.grillStore.listGrillsForUser(user.id) })

    if (url.pathname === '/api/grills' && request.method === 'POST') {
      const body = await readBody(request)
      if (!body) return json({ error: 'Invalid Grill' }, 400)
      const kind = body.kind
      const visibility = body.visibility
      const agentDefinitionId = body.agentDefinitionId
      if (typeof kind !== 'string' || !kinds.has(kind as GrillKind))
        return json({ error: 'Invalid Grill kind' }, 400)
      if (
        typeof visibility !== 'string' ||
        !visibilities.has(visibility as GrillVisibility)
      )
        return json({ error: 'Invalid Grill visibility' }, 400)
      if (typeof agentDefinitionId !== 'string' || !agentDefinitionId)
        return json({ error: 'Invalid agent definition' }, 400)
      const baseRef =
        typeof body.baseRef === 'string' && body.baseRef
          ? body.baseRef
          : undefined
      try {
        const grill = deps.grillStore.createGrill({
          id: crypto.randomUUID(),
          kind: kind as GrillKind,
          visibility: visibility as GrillVisibility,
          agentDefinitionId,
          ...(baseRef ? { baseRef } : {}),
          createdBy: user.id,
          createdAt: Date.now(),
        })
        return json({ grill }, 201)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create Grill'
        return json({ error: message }, 400)
      }
    }

    const submitRoute = url.pathname.match(/^\/api\/grills\/([^/]+)\/submit$/)
    if (submitRoute && request.method === 'POST') {
      const id = submitRoute[1]!
      if (!deps.grillStore.getGrillForUser(id, user.id))
        return json({ error: 'Grill not found' }, 404)
      const grill = deps.grillStore.submitRound(id, Date.now())
      if (!grill) return json({ error: 'Grill not found' }, 404)
      return json({ grill })
    }

    const draftsRoute = url.pathname.match(/^\/api\/grills\/([^/]+)\/drafts$/)
    if (draftsRoute && request.method === 'PATCH') {
      const id = draftsRoute[1]!
      if (!deps.grillStore.getGrillForUser(id, user.id))
        return json({ error: 'Grill not found' }, 404)
      const body = await readBody(request)
      if (!body || typeof body.drafts !== 'object' || body.drafts === null)
        return json({ error: 'Invalid drafts' }, 400)
      const drafts: Record<string, string> = {}
      for (const [key, value] of Object.entries(
        body.drafts as Record<string, unknown>,
      )) {
        if (typeof value !== 'string')
          return json({ error: 'Invalid drafts' }, 400)
        drafts[key] = value
      }
      const grill = deps.grillStore.updateDrafts(id, drafts, Date.now())
      if (!grill) return json({ error: 'Grill not found' }, 404)
      return json({ grill })
    }

    const route = url.pathname.match(/^\/api\/grills\/([^/]+)$/)
    if (!route) return undefined
    const id = route[1]!

    if (request.method === 'GET') {
      const grill = deps.grillStore.getGrillForUser(id, user.id)
      if (!grill) return json({ error: 'Grill not found' }, 404)
      return json({ grill })
    }

    if (request.method === 'DELETE') {
      const grill = deps.grillStore.getGrillForUser(id, user.id)
      if (!grill) return json({ error: 'Grill not found' }, 404)
      deps.grillStore.discardGrill(id)
      return json({ ok: true })
    }

    return undefined
  }
}
