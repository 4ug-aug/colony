import { migratedDatabase } from '#/server/test-db'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import { createAdmissionStore } from '#/server/features/accounts/admission'
import { createAdmissionHttpHandler } from '#/server/features/accounts/admission-http'
import { createWorkspaceGitHubConfig, type ConnectGitHub } from './github-config'

let previousSecret: string | undefined
beforeEach(() => {
  previousSecret = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = 'test-secret'
})
afterEach(() => {
  process.env.BETTER_AUTH_SECRET = previousSecret
})

const keys: string[] = []
const connect: ConnectGitHub = async (input) => {
  keys.push(input.privateKey)
  if (input.repository === 'acme/missing')
    throw new Error("GitHub App isn't installed on acme/missing")
  return { slug: 'colony-test', installationId: 42 }
}

const input = {
  appId: '123',
  privateKey: 'pem-one',
  repository: 'acme/widgets',
  base: 'main',
}

test('stores the App encrypted, exposes no key, and reuses the key on re-save', async () => {
  const sqlite = migratedDatabase()
  const config = createWorkspaceGitHubConfig(sqlite, { connect })
  expect(config.public()).toEqual({ configured: false })
  expect(config.current()).toBeUndefined()

  expect(await config.save(input)).toEqual({
    configured: true,
    appId: '123',
    repository: 'acme/widgets',
    base: 'main',
    installUrl: 'https://github.com/apps/colony-test/installations/new',
  })
  const row = sqlite
    .query('SELECT installation_id, api_key_ciphertext FROM workspace_github_config')
    .get() as { installation_id: number; api_key_ciphertext: string }
  expect(row.installation_id).toBe(42)
  expect(row.api_key_ciphertext).not.toContain('pem-one')

  const first = config.current()
  expect(first).toMatchObject({ repository: 'acme/widgets', base: 'main' })
  expect(config.current()).toBe(first!)

  await config.save({ ...input, privateKey: '', base: 'develop' })
  expect(keys.at(-1)).toBe('pem-one')
  expect(config.current()).not.toBe(first!)
  expect(config.current()?.base).toBe('develop')

  expect(config.clear()).toEqual({ configured: false })
  expect(config.current()).toBeUndefined()
})

test('rejects bad input and failed App checks without writing', async () => {
  const sqlite = migratedDatabase()
  const config = createWorkspaceGitHubConfig(sqlite, { connect })
  await expect(config.save({ ...input, privateKey: '' })).rejects.toThrow(
    'Private key is required',
  )
  await expect(config.save({ ...input, repository: 'widgets' })).rejects.toThrow(
    'Repository must be owner/name',
  )
  await expect(
    config.save({ ...input, repository: 'acme/missing' }),
  ).rejects.toThrow("isn't installed")
  expect(config.public()).toEqual({ configured: false })
})

test('GitHub settings are admin-only over HTTP and surface save errors', async () => {
  const sqlite = migratedDatabase()
  const handler = createAdmissionHttpHandler({
    store: createAdmissionStore(sqlite),
    authenticate: async (request) =>
      request.headers.get('cookie') === 'admin'
        ? { id: 'admin', name: 'admin', role: 'admin' }
        : { id: 'user', name: 'user', role: 'user' },
    guiOrigin: 'http://localhost:3000',
    onSuspend: () => {},
    createAccount: async () => Response.json({}),
    listUsers: async () => [],
    banUser: async () => ({}),
    unbanUser: async () => ({}),
    setUserRole: async () => ({}),
    resetUserPassword: async () => Response.json({}),
    github: createWorkspaceGitHubConfig(sqlite, {
      connect,
      listRepositories: async () => [
        { fullName: 'acme/widgets', defaultBranch: 'main' },
      ],
      listBranches: async ({ repository }) => [`${repository}:main`],
    }),
  })
  const url = new URL('http://localhost/api/workspace/settings/github')
  const post = (body: unknown, cookie = 'admin') =>
    handler(
      new Request(url, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      url,
    )

  expect((await handler(new Request(url, { headers: { cookie: 'user' } }), url))?.status).toBe(403)
  expect((await post(input, 'user'))?.status).toBe(403)

  const missing = await post({ ...input, repository: 'acme/missing' })
  expect(missing?.status).toBe(400)
  expect(await missing!.json()).toEqual({
    error: "GitHub App isn't installed on acme/missing",
  })

  const saved = await post(input)
  expect(saved?.status).toBe(200)
  expect(await saved!.json()).toMatchObject({ configured: true })

  const listing = (path: string, body: unknown, cookie = 'admin') => {
    const listingUrl = new URL(`http://localhost/api/workspace/settings/github/${path}`)
    return handler(
      new Request(listingUrl, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      listingUrl,
    )
  }
  expect((await listing('repositories', input, 'user'))?.status).toBe(403)
  // Blank key falls back to the stored one.
  const repositories = await listing('repositories', { appId: '123' })
  expect(await repositories!.json()).toEqual({
    repositories: [{ fullName: 'acme/widgets', defaultBranch: 'main' }],
  })
  const branches = await listing('branches', { appId: '123', repository: 'acme/widgets' })
  expect(await branches!.json()).toEqual({ branches: ['acme/widgets:main'] })
  const unsaved = await listing('repositories', { appId: 'abc' })
  expect(unsaved?.status).toBe(400)
  expect(await unsaved!.json()).toEqual({ error: 'App ID must be a number' })

  const clearUrl = new URL('http://localhost/api/workspace/settings/github/clear')
  const cleared = await handler(
    new Request(clearUrl, { method: 'POST', headers: { cookie: 'admin' } }),
    clearUrl,
  )
  expect(await cleared!.json()).toEqual({ configured: false })
})
