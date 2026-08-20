import { migratedDatabase, seedAccounts } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { createAdmissionStore } from '#/server/features/accounts/admission'
import { createAdmissionHttpHandler } from '#/server/features/accounts/admission-http'
import { createUserConnections } from './user-connections'
import { createWorkspaceConnections } from '#/server/features/workspace/workspace-connections'
import { createOutlookAdapter } from '#project/agents/software-engineer-adapters'

const withSecret = <T>(run: () => T): T => {
  const previous = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = 'test-secret'
  try {
    return run()
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = previous
  }
}

const createStore = () => {
  const sqlite = migratedDatabase()
  seedAccounts(sqlite, ['ada', 'bob'])
  return { sqlite, store: createUserConnections(sqlite) }
}

test('saves encrypted per-user Outlook tokens and two users do not clobber each other', () => {
  withSecret(() => {
    const { sqlite, store } = createStore()
    const ada = store.save('ada', {
      kind: 'outlook',
      fields: { account: 'ada@example.com' },
      apiKey: JSON.stringify({ refreshToken: 'ada-refresh' }),
    })
    const bob = store.save('bob', {
      kind: 'outlook',
      fields: { account: 'bob@example.com' },
      apiKey: JSON.stringify({ refreshToken: 'bob-refresh' }),
    })
    expect(ada).toEqual({
      kind: 'outlook',
      configured: true,
      account: 'ada@example.com',
    })
    expect(bob).toEqual({
      kind: 'outlook',
      configured: true,
      account: 'bob@example.com',
    })
    expect(ada).not.toHaveProperty('apiKey')
    expect(
      sqlite
        .query(
          'SELECT api_key_ciphertext FROM user_connection WHERE user_id = ?',
        )
        .get('ada'),
    ).not.toEqual({ api_key_ciphertext: 'ada-refresh' })

    expect(store.loadSecret('ada', 'outlook')?.secret).toContain('ada-refresh')
    expect(store.loadSecret('bob', 'outlook')?.secret).toContain('bob-refresh')
    expect(store.loadSecret('ada', 'outlook')?.secret).not.toContain(
      'bob-refresh',
    )

    store.clear('ada', 'outlook')
    expect(store.get('ada', 'outlook')).toEqual({
      kind: 'outlook',
      configured: false,
    })
    expect(store.get('bob', 'outlook')).toMatchObject({
      configured: true,
      account: 'bob@example.com',
    })
  })
})

test('Outlook tools use the invoking user and fail when that user has not connected', async () => {
  const previous = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = 'test-secret'
  try {
    const { store } = createStore()
    store.save('ada', {
      kind: 'outlook',
      fields: { account: 'ada@example.com' },
      apiKey: JSON.stringify({ refreshToken: 'ada-refresh' }),
    })
    const loaded: string[] = []
    const adapter = createOutlookAdapter({
      loadSecret: (userId) => {
        loaded.push(userId)
        return store.loadSecret(userId, 'outlook')?.secret
      },
      clientId: 'client-id',
      clientSecret: 'client-secret',
    })

    const adaUpstream = adapter.capability!.createUpstream({
      grantContext: { userId: 'ada', agentDefinitionId: 'antboy' },
    })
    expect(loaded).toEqual(['ada'])
    expect(adaUpstream.listTools).toBeDefined()

    const missing = adapter.capability!.createUpstream({
      grantContext: { userId: 'bob', agentDefinitionId: 'antboy' },
    })
    expect(loaded).toEqual(['ada', 'bob'])
    await expect(missing.callTool('outlook.search_messages', {})).rejects.toThrow(
      'Connect Outlook in Account settings',
    )
    await expect(
      adapter
        .capability!.createUpstream({
          grantContext: { agentDefinitionId: 'antboy' },
        })
        .callTool('outlook.search_messages', {}),
    ).rejects.toThrow('Connect Outlook in Account settings')
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = previous
  }
})

test('signed-in member can start Outlook OAuth; workspace catalog does not include Outlook', async () => {
  const previous = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = 'test-secret'
  try {
    const sqlite = migratedDatabase()
    sqlite
      .query('INSERT INTO user (id, name, email) VALUES (?, ?, ?)')
      .run('admin', 'Admin', 'admin@example.com')
    sqlite
      .query('INSERT INTO user (id, name, email) VALUES (?, ?, ?)')
      .run('user', 'User', 'user@example.com')
    const connections = createWorkspaceConnections(sqlite)
    const userConnections = createUserConnections(sqlite)
    const handler = createAdmissionHttpHandler({
      store: createAdmissionStore(sqlite),
      authenticate: async (request) =>
        request.headers.get('cookie') === 'admin'
          ? { id: 'admin', name: 'admin', role: 'admin' }
          : request.headers.get('cookie') === 'user'
            ? { id: 'user', name: 'user', role: 'user' }
            : undefined,
      guiOrigin: 'http://localhost:3000',
      onSuspend: () => {},
      createAccount: async () => Response.json({}),
      listUsers: async () => [],
      banUser: async () => ({}),
      unbanUser: async () => ({}),
      connections,
      userConnections,
    })

    const listed = await handler(
      new Request('http://localhost/api/workspace/settings/connections', {
        headers: { cookie: 'admin' },
      }),
      new URL('http://localhost/api/workspace/settings/connections'),
    )
    const catalog = (await listed!.json()) as {
      connections: { id: string }[]
    }
    expect(catalog.connections.map((item) => item.id)).not.toContain('outlook')

    const workspaceOauth = await handler(
      new Request(
        'http://localhost/api/workspace/settings/connections/outlook/oauth/start',
        { headers: { cookie: 'admin' } },
      ),
      new URL(
        'http://localhost/api/workspace/settings/connections/outlook/oauth/start',
      ),
    )
    expect(workspaceOauth).toBeUndefined()

    const status = await handler(
      new Request('http://localhost/api/account/connections/outlook', {
        headers: { cookie: 'user' },
      }),
      new URL('http://localhost/api/account/connections/outlook'),
    )
    expect(status?.status).toBe(200)
    expect(await status!.json()).toEqual({
      connection: { kind: 'outlook', configured: false },
    })

    const oauthStart = await handler(
      new Request(
        'http://localhost/api/account/connections/outlook/oauth/start',
        { headers: { cookie: 'user' } },
      ),
      new URL('http://localhost/api/account/connections/outlook/oauth/start'),
    )
    expect(oauthStart?.status).toBe(400)
    expect(await oauthStart!.json()).toEqual({
      error: 'Outlook OAuth is not configured',
    })
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = previous
  }
})
