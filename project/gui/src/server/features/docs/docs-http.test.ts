import { migratedDatabase, seedAccounts } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { createSqliteDocStore } from './doc-store'
import { createDocsHttp } from './docs-http'
import type { WorkspaceServerMessage } from '#/server/coordinator'
import type { RoomUser } from '#/server/features/rooms/room-store'


const ada: RoomUser = { id: 'ada', name: 'Ada' }

function harness() {
  const sqlite = migratedDatabase()
  seedAccounts(sqlite, ['ada'])
  const docStore = createSqliteDocStore(sqlite)
  const broadcasts: WorkspaceServerMessage[] = []
  const handle = createDocsHttp({
    docStore,
    broadcastWorkspace: (message) => broadcasts.push(message),
  })

  const call = async (method: string, path: string, body?: unknown) => {
    const url = new URL(`http://localhost${path}`)
    const request = new Request(url, {
      method,
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { 'content-type': 'application/json' },
          }),
    })
    const response = await handle(request, url, ada)
    if (!response) throw new Error(`unrouted: ${method} ${path}`)
    return {
      status: response.status,
      body: (await response.json()) as Record<string, any>,
    }
  }

  return { call, broadcasts, sqlite, docStore }
}

test('POST/GET/PATCH happy path', async () => {
  const { call, broadcasts, sqlite } = harness()

  const created = await call('POST', '/api/docs', {
    title: 'Design',
    body: 'Hello',
  })
  expect(created.status).toBe(201)
  expect(created.body.doc).toMatchObject({
    title: 'Design',
    body: 'Hello',
    createdBy: { id: 'ada', name: 'Ada' },
  })
  expect(broadcasts.at(-1)?.type).toBe('doc.created')
  const id = created.body.doc.id as string

  const listed = await call('GET', '/api/docs')
  expect(listed.status).toBe(200)
  expect(listed.body.docs).toHaveLength(1)
  expect(listed.body.docs[0].id).toBe(id)

  const got = await call('GET', `/api/docs/${id}`)
  expect(got.status).toBe(200)
  expect(got.body.doc.id).toBe(id)

  const patched = await call('PATCH', `/api/docs/${id}`, {
    title: 'Revised',
    body: 'Updated',
  })
  expect(patched.status).toBe(200)
  expect(patched.body.doc).toMatchObject({ title: 'Revised', body: 'Updated' })
  expect(broadcasts.at(-1)?.type).toBe('doc.changed')

  const deleted = await call('DELETE', `/api/docs/${id}`)
  expect(deleted.status).toBe(200)
  expect(deleted.body.ok).toBe(true)
  expect(broadcasts.at(-1)?.type).toBe('doc.deleted')
  expect((await call('GET', `/api/docs/${id}`)).status).toBe(404)
  expect((await call('GET', '/api/docs')).body.docs).toHaveLength(0)

  sqlite.close()
})

test('rejects body too long', async () => {
  const { call, sqlite, docStore } = harness()
  const long = 'x'.repeat(10_001)

  expect((await call('POST', '/api/docs', { body: long })).status).toBe(400)

  const doc = docStore.createDoc({
    id: 'd1',
    title: 't',
    body: 'ok',
    createdBy: 'ada',
    createdAt: 10,
  })
  expect(
    (await call('PATCH', `/api/docs/${doc.id}`, { body: long })).status,
  ).toBe(400)

  sqlite.close()
})
