import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createAdmissionStore } from './admission'
import { createCoordinator } from './coordinator'
import { createRoomMessageHub } from './room-hub'
import { createSqliteRoomStore } from './room-store'
import type { RunControl } from './run-control'

const makeDatabase = () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY);
    CREATE TABLE admission_setup_token (
      id INTEGER PRIMARY KEY,
      token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      claimed_at INTEGER,
      redeemed_at INTEGER
    );
    CREATE TABLE workspace_invitation (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      claimed_at INTEGER,
      redeemed_at INTEGER,
      revoked_at INTEGER
    );
  `)
  return sqlite
}

test('setup token is created once and only its hash persists', () => {
  const sqlite = makeDatabase()
  const first = createAdmissionStore(sqlite).ensureSetupToken()
  expect(first).toBeTruthy()
  expect(first).not.toBe(createAdmissionStore(sqlite).ensureSetupToken())
  expect(
    sqlite.query('SELECT token_hash FROM admission_setup_token').get(),
  ).toEqual({ token_hash: expect.any(String) })
  const row = sqlite.query('SELECT token_hash FROM admission_setup_token').get() as {
    token_hash: string
  }
  expect(row.token_hash).not.toBe(first)
  sqlite.close()
})

test('rotating a setup token invalidates the old token', () => {
  const sqlite = makeDatabase()
  const store = createAdmissionStore(sqlite)
  const original = store.ensureSetupToken()!
  const rotated = store.rotateSetupToken()
  expect(rotated).not.toBe(original)
  expect(store.claimSetupToken(original)).toBe(false)
  expect(store.claimSetupToken(rotated)).toBe(true)
  sqlite.close()
})

test('invitation lifetime, revocation, expiry, and redemption are durable states', () => {
  const sqlite = makeDatabase()
  const store = createAdmissionStore(sqlite)
  const created = store.createInvitation('admin', 3)
  expect(created.invitation.state).toBe('pending')
  expect(store.revokeInvitation(created.invitation.id)).toBe(true)
  expect(store.listInvitations()[0]?.state).toBe('revoked')
  const expired = store.createInvitation('admin', 1)
  sqlite
    .query('UPDATE workspace_invitation SET expires_at = 0 WHERE id = ?')
    .run(expired.invitation.id)
  expect(store.listInvitations().find(({ id }) => id === expired.invitation.id)?.state).toBe('expired')
  const redeemed = store.createInvitation('admin', 7)
  expect(store.claimInvitation(redeemed.token)?.id).toBe(redeemed.invitation.id)
  store.redeemInvitation(redeemed.invitation.id)
  expect(store.listInvitations().find(({ id }) => id === redeemed.invitation.id)?.state).toBe('redeemed')
  sqlite.close()
})

test('concurrent invitation redemption claims at most once', async () => {
  const sqlite = makeDatabase()
  const store = createAdmissionStore(sqlite)
  const created = store.createInvitation('admin', 3)
  const claims = await Promise.all([
    Promise.resolve(store.claimInvitation(created.token)),
    Promise.resolve(store.claimInvitation(created.token)),
  ])
  expect(claims.filter(Boolean)).toHaveLength(1)
  sqlite.close()
})

test('admission endpoints close open signup and enforce the administrator boundary', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, image TEXT);
    CREATE TABLE room (id TEXT PRIMARY KEY, name TEXT NOT NULL, visibility TEXT DEFAULT 'public' NOT NULL, created_by TEXT);
    CREATE TABLE room_member (room_id TEXT NOT NULL, user_id TEXT NOT NULL, added_by TEXT, added_at INTEGER NOT NULL, PRIMARY KEY (room_id, user_id));
    CREATE TABLE room_message (id TEXT PRIMARY KEY, room_id TEXT, author_id TEXT, author_name TEXT, author_image TEXT, author_kind TEXT DEFAULT 'user' NOT NULL, text TEXT, created_at INTEGER);
    CREATE TABLE room_run (id TEXT PRIMARY KEY, room_id TEXT, trigger_message_id TEXT, requested_by_id TEXT, requested_by_name TEXT, requested_by_image TEXT, task TEXT, agent_id TEXT, state TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER, exit_code INTEGER, error TEXT, stdout TEXT, stderr TEXT);
    CREATE TABLE run_step (id TEXT PRIMARY KEY, run_id TEXT, room_id TEXT, idx INTEGER, kind TEXT, tool TEXT, call_id TEXT, text TEXT, created_at INTEGER);
    CREATE TABLE admission_setup_token (id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL, created_at INTEGER NOT NULL, claimed_at INTEGER, redeemed_at INTEGER);
    CREATE TABLE workspace_invitation (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, claimed_at INTEGER, redeemed_at INTEGER, revoked_at INTEGER);
  `)
  const admission = createAdmissionStore(sqlite)
  const token = admission.ensureSetupToken()!
  let administrator = false
  const signUp = async (body: Record<string, unknown>) => {
    const id = crypto.randomUUID()
    sqlite
      .query('INSERT INTO user (id, name, email) VALUES (?, ?, ?)')
      .run(id, body.name as string, body.email as string)
    if (!administrator) administrator = true
    return Response.json({ user: { id } }, { headers: { 'set-cookie': `sweat=${id}` } })
  }
  const control = {
    listRuns: () => [],
    subscribe: () => () => undefined,
    subscribeSteps: () => () => undefined,
    start: () => '',
    cancel: async () => undefined,
  } as unknown as RunControl
  const store = createSqliteRoomStore(sqlite)
  const coordinator = createCoordinator({
    control,
    store,
    messages: createRoomMessageHub(store),
    authenticator: {
      authenticate: async (request) =>
        request.headers.get('cookie') === 'admin'
          ? { id: 'admin', name: 'admin', role: 'admin' }
          : request.headers.get('cookie') === 'member'
            ? { id: 'member', name: 'member', role: 'user' }
            : undefined,
    },
    authHandler: async () => Response.json({ ok: true }),
    origin: 'http://localhost:3000',
    port: 0,
    admission: {
      store: admission,
      setAdministrator: async () => undefined,
      listUsers: async () => [{ id: 'admin' }],
      banUser: async () => ({ ok: true }),
      unbanUser: async () => ({ ok: true }),
    },
    signUp,
  })
  const request = (path: string, init: RequestInit = {}) =>
    fetch(`http://localhost:${coordinator.port}${path}`, {
      ...init,
      headers: {
        origin: 'http://localhost:3000',
        ...(init.headers ?? {}),
      },
    })
  try {
    expect((await request('/api/admission/status')).json()).toBeDefined()
    expect(
      (await request('/api/auth/sign-up/email', { method: 'POST' })).status,
    ).toBe(403)
    const setup = await request('/api/admission/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sweat-setup-token': token },
      body: JSON.stringify({ email: 'admin@example.com', username: 'admin', password: 'password-123' }),
    })
    expect(setup.status).toBe(200)
    expect(administrator).toBe(true)
    const invitation = await request('/api/workspace/invitations', {
      method: 'POST',
      headers: { cookie: 'admin', 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(invitation.status).toBe(201)
    const created = (await invitation.json()) as { token: string; invitation: { expiresAt: number } }
    expect(created.invitation.expiresAt - Date.now()).toBeGreaterThan(2 * 24 * 60 * 60 * 1000)
    expect(
      (await request('/api/workspace/invitations', { headers: { cookie: 'member' } })).status,
    ).toBe(403)
    expect(
      (await request('/api/workspace/invitations', { headers: { cookie: 'admin' } })).status,
    ).toBe(200)
  } finally {
    coordinator.stop()
    sqlite.close()
  }
})
