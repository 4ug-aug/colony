import { migratedDatabase, seedAccounts } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { createSqliteBulletinStore } from './bulletin-store'
import { createBulletinsHttp } from './bulletins-http'
import type { WorkspaceServerMessage } from '#/server/protocol'
import type { RoomUser } from '#/server/features/rooms/room-store'


const ada: RoomUser = { id: 'ada', name: 'Ada' }

function harness() {
  const sqlite = migratedDatabase()
  seedAccounts(sqlite, ['ada'])
  const bulletinStore = createSqliteBulletinStore(sqlite)
  const broadcasts: WorkspaceServerMessage[] = []
  const handle = createBulletinsHttp({
    bulletinStore,
    broadcastWorkspace: (message) => broadcasts.push(message),
  })
  bulletinStore.createBulletin({
    id: 'b1',
    body: 'Lunch?',
    x: 0.5,
    y: 0.5,
    createdBy: 'ada',
    createdAt: 10,
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

  return { call, broadcasts, sqlite }
}

test('PATCH validates poll options and never trusts client votes', async () => {
  const { call, broadcasts, sqlite } = harness()

  expect(
    (
      await call('PATCH', '/api/bulletins/b1', {
        poll: { options: ['Only one'] },
      })
    ).status,
  ).toBe(400)
  expect(
    (await call('PATCH', '/api/bulletins/b1', { poll: { options: ['a', 1] } }))
      .status,
  ).toBe(400)
  expect(
    (
      await call('PATCH', '/api/bulletins/b1', {
        poll: { options: Array(9).fill('x') },
      })
    ).status,
  ).toBe(400)

  // Blank options are trimmed away, and a forged vote map is discarded.
  const created = await call('PATCH', '/api/bulletins/b1', {
    poll: {
      options: [' Pizza ', 'Sushi', '   '],
      votes: { mallory: [0] },
    },
  })
  expect(created.status).toBe(200)
  expect(created.body.bulletin.poll).toEqual({
    options: ['Pizza', 'Sushi'],
    votes: {},
  })
  expect(broadcasts.at(-1)?.type).toBe('bulletin.changed')

  sqlite.close()
})

test('POST /vote records, limits, and retracts a vote', async () => {
  const { call, broadcasts, sqlite } = harness()

  // No poll yet.
  expect(
    (await call('POST', '/api/bulletins/b1/vote', { options: [0] })).status,
  ).toBe(400)
  expect(
    (await call('POST', '/api/bulletins/nope/vote', { options: [0] })).status,
  ).toBe(404)

  await call('PATCH', '/api/bulletins/b1', {
    poll: { options: ['Pizza', 'Sushi', 'Tacos'] },
  })

  expect(
    (await call('POST', '/api/bulletins/b1/vote', { options: [3] })).status,
  ).toBe(400)
  expect(
    (await call('POST', '/api/bulletins/b1/vote', { options: [1.5] })).status,
  ).toBe(400)
  expect(
    (await call('POST', '/api/bulletins/b1/vote', { options: 'yes' })).status,
  ).toBe(400)

  // Single choice keeps only the first index.
  const single = await call('POST', '/api/bulletins/b1/vote', {
    options: [2, 0],
  })
  expect(single.body.bulletin.poll.votes).toEqual({ ada: [2] })
  expect(broadcasts.at(-1)?.type).toBe('bulletin.changed')

  // Multi keeps every index, de-duplicated.
  await call('PATCH', '/api/bulletins/b1', {
    poll: { options: ['Pizza', 'Sushi', 'Tacos'], multi: true },
  })
  const multi = await call('POST', '/api/bulletins/b1/vote', {
    options: [0, 1, 0],
  })
  expect(multi.body.bulletin.poll.votes).toEqual({ ada: [0, 1] })

  // An empty selection is a retraction.
  const cleared = await call('POST', '/api/bulletins/b1/vote', { options: [] })
  expect(cleared.body.bulletin.poll.votes).toEqual({})

  sqlite.close()
})

test('switching a poll back to single choice trims carried-over votes', async () => {
  const { call, sqlite } = harness()

  await call('PATCH', '/api/bulletins/b1', {
    poll: { options: ['Pizza', 'Sushi', 'Tacos'], multi: true },
  })
  await call('POST', '/api/bulletins/b1/vote', { options: [1, 2] })

  const narrowed = await call('PATCH', '/api/bulletins/b1', {
    poll: { options: ['Pizza', 'Sushi'] },
  })
  expect(narrowed.body.bulletin.poll).toEqual({
    options: ['Pizza', 'Sushi'],
    votes: { ada: [1] },
  })

  sqlite.close()
})
