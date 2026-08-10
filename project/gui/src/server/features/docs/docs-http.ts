import type { WorkspaceServerMessage } from '#/server/coordinator'
import type { DocStore } from './doc-store'
import type { RoomUser } from '#/server/features/rooms/room-store'
import { json, readBody } from '#/server/http/respond'

const maxBodyLength = 10_000

export function createDocsHttp(deps: {
  docStore: DocStore
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
    if (url.pathname === '/api/docs' && request.method === 'GET')
      return json({ docs: deps.docStore.listDocs() })

    if (url.pathname === '/api/docs' && request.method === 'POST') {
      const body = await readBody(request)
      if (!body) return json({ error: 'Invalid doc' }, 400)
      const title = typeof body.title === 'string' ? body.title : ''
      const text = typeof body.body === 'string' ? body.body : ''
      if (text.length > maxBodyLength)
        return json({ error: 'Doc body too long' }, 400)
      const now = Date.now()
      const doc = deps.docStore.createDoc({
        id: crypto.randomUUID(),
        title,
        body: text,
        createdBy: user.id,
        createdAt: now,
      })
      deps.broadcastWorkspace({ type: 'doc.created', doc })
      return json({ doc }, 201)
    }

    const route = url.pathname.match(/^\/api\/docs\/([^/]+)$/)
    if (!route) return undefined
    const id = route[1]!

    if (request.method === 'GET') {
      const doc = deps.docStore.getDoc(id)
      if (!doc) return json({ error: 'Doc not found' }, 404)
      return json({ doc })
    }

    if (request.method === 'PATCH') {
      const current = deps.docStore.getDoc(id)
      if (!current) return json({ error: 'Doc not found' }, 404)
      const body = await readBody(request)
      if (!body) return json({ error: 'Invalid doc' }, 400)
      const patch: { title?: string; body?: string } = {}
      if (body.title !== undefined) {
        if (typeof body.title !== 'string')
          return json({ error: 'Invalid doc title' }, 400)
        patch.title = body.title
      }
      if (body.body !== undefined) {
        if (typeof body.body !== 'string')
          return json({ error: 'Invalid doc body' }, 400)
        if (body.body.length > maxBodyLength)
          return json({ error: 'Doc body too long' }, 400)
        patch.body = body.body
      }
      if (patch.title === undefined && patch.body === undefined)
        return json({ error: 'Nothing to update' }, 400)
      const doc = deps.docStore.updateDoc(id, patch, Date.now())
      if (!doc) return json({ error: 'Doc not found' }, 404)
      deps.broadcastWorkspace({ type: 'doc.changed', doc })
      return json({ doc })
    }

    if (request.method === 'DELETE') {
      const deleted = deps.docStore.deleteDoc(id)
      if (!deleted) return json({ error: 'Doc not found' }, 404)
      deps.broadcastWorkspace({ type: 'doc.deleted', docId: id })
      return json({ ok: true })
    }

    return undefined
  }
}
