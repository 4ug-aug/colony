/* eslint-disable @typescript-eslint/method-signature-style -- accepts Bun and better-sqlite3 statements */
import { createHash, randomBytes } from 'node:crypto'

type Statement = {
  all(...values: unknown[]): unknown[]
  get(...values: unknown[]): unknown
  run(...values: unknown[]): { changes?: number }
}
type Sqlite = { prepare(sql: string): Statement }

export type InvitationState = 'pending' | 'expired' | 'revoked' | 'redeemed'
export type Invitation = {
  id: string
  createdBy: string
  createdAt: number
  expiresAt: number
  state: InvitationState
}

const hash = (value: string): string =>
  createHash('sha256').update(value).digest('hex')
const token = (): string => randomBytes(32).toString('base64url')
const now = (): number => Date.now()

const userCount = (sqlite: Sqlite): number => {
  const row = sqlite.prepare('SELECT COUNT(*) AS count FROM user').get() as {
    count: number
  }
  return row.count
}

const invitationState = (row: {
  expires_at: number
  revoked_at: number | null
  redeemed_at: number | null
}): InvitationState => {
  if (row.redeemed_at != null) return 'redeemed'
  if (row.revoked_at != null) return 'revoked'
  if (row.expires_at <= now()) return 'expired'
  return 'pending'
}

const invitationFrom = (row: {
  id: string
  created_by: string
  created_at: number
  expires_at: number
  revoked_at: number | null
  redeemed_at: number | null
}): Invitation => ({
  id: row.id,
  createdBy: row.created_by,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  state: invitationState(row),
})

export function createAdmissionStore(sqlite: Sqlite) {
  const ensureSetupToken = (): string | undefined => {
    if (userCount(sqlite) > 0) return undefined
    const existing = sqlite
      .prepare('SELECT id FROM admission_setup_token WHERE id = 1')
      .get()
    if (existing) return undefined
    const plaintext = token()
    sqlite
      .prepare(
        'INSERT OR IGNORE INTO admission_setup_token (id, token_hash, created_at) VALUES (1, ?, ?)',
      )
      .run(hash(plaintext), now())
    return plaintext
  }

  const rotateSetupToken = (): string => {
    if (userCount(sqlite) > 0)
      throw new Error('Setup is already complete; the setup token cannot rotate')
    const plaintext = token()
    sqlite
      .prepare(
        `INSERT INTO admission_setup_token (id, token_hash, created_at, claimed_at, redeemed_at)
         VALUES (1, ?, ?, NULL, NULL)
         ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at, claimed_at = NULL, redeemed_at = NULL`,
      )
      .run(hash(plaintext), now())
    return plaintext
  }

  const claimSetupToken = (plaintext: string): boolean => {
    if (userCount(sqlite) > 0) return false
    const result = sqlite
      .prepare(
        `UPDATE admission_setup_token
         SET claimed_at = ?
         WHERE id = 1 AND token_hash = ? AND claimed_at IS NULL AND redeemed_at IS NULL`,
      )
      .run(now(), hash(plaintext))
    return result.changes === 1
  }

  const releaseSetupToken = (): void => {
    sqlite
      .prepare('UPDATE admission_setup_token SET claimed_at = NULL WHERE id = 1')
      .run()
  }

  const redeemSetupToken = (): void => {
    sqlite
      .prepare(
        'UPDATE admission_setup_token SET claimed_at = NULL, redeemed_at = ? WHERE id = 1',
      )
      .run(now())
  }

  const createInvitation = (createdBy: string, days: 1 | 3 | 7) => {
    const plaintext = token()
    const invitation: Invitation = {
      id: crypto.randomUUID(),
      createdBy,
      createdAt: now(),
      expiresAt: now() + days * 24 * 60 * 60 * 1000,
      state: 'pending',
    }
    sqlite
      .prepare(
        `INSERT INTO workspace_invitation
         (id, token_hash, created_by, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        invitation.id,
        hash(plaintext),
        invitation.createdBy,
        invitation.createdAt,
        invitation.expiresAt,
      )
    return { token: plaintext, invitation }
  }

  const listInvitations = (): Invitation[] =>
    (
      sqlite
        .prepare(
          'SELECT id, created_by, created_at, expires_at, revoked_at, redeemed_at FROM workspace_invitation ORDER BY created_at DESC, id',
        )
        .all() as {
        id: string
        created_by: string
        created_at: number
        expires_at: number
        revoked_at: number | null
        redeemed_at: number | null
      }[]
    ).map(invitationFrom)

  const claimInvitation = (plaintext: string): Invitation | undefined => {
    const row = sqlite
      .prepare(
        `SELECT id, created_by, created_at, expires_at, revoked_at, redeemed_at
         FROM workspace_invitation
         WHERE token_hash = ? AND claimed_at IS NULL AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      )
      .get(hash(plaintext), now()) as
      | {
          id: string
          created_by: string
          created_at: number
          expires_at: number
          revoked_at: null
          redeemed_at: null
        }
      | undefined
    if (!row) return undefined
    const result = sqlite
      .prepare(
        'UPDATE workspace_invitation SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL AND redeemed_at IS NULL AND revoked_at IS NULL',
      )
      .run(now(), row.id)
    return result.changes === 1 ? invitationFrom(row) : undefined
  }

  const releaseInvitation = (id: string): void => {
    sqlite
      .prepare('UPDATE workspace_invitation SET claimed_at = NULL WHERE id = ?')
      .run(id)
  }

  const redeemInvitation = (id: string): void => {
    sqlite
      .prepare(
        'UPDATE workspace_invitation SET claimed_at = NULL, redeemed_at = ? WHERE id = ?',
      )
      .run(now(), id)
  }

  const revokeInvitation = (id: string): boolean => {
    const result = sqlite
      .prepare(
        'UPDATE workspace_invitation SET revoked_at = ? WHERE id = ? AND redeemed_at IS NULL AND revoked_at IS NULL',
      )
      .run(now(), id)
    return result.changes === 1
  }

  return {
    ensureSetupToken,
    rotateSetupToken,
    claimSetupToken,
    releaseSetupToken,
    redeemSetupToken,
    createInvitation,
    listInvitations,
    claimInvitation,
    releaseInvitation,
    redeemInvitation,
    revokeInvitation,
    hasUsers: () => userCount(sqlite) > 0,
  }
}

export type AdmissionStore = ReturnType<typeof createAdmissionStore>
