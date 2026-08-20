import { createSecretBox } from '#/server/secret-box'
import type { Sqlite } from '#/server/sqlite'

const { encrypt, decrypt } = createSecretBox('sweat-user-connections')

const kinds = ['outlook'] as const

type UserConnectionKind = (typeof kinds)[number]

type StoredConnection = {
  user_id: string
  kind: string
  fields_json: string
  api_key_ciphertext: string | null
  api_key_iv: string | null
  api_key_tag: string | null
  created_at?: number
}

export type PublicUserConnection = {
  kind: UserConnectionKind
  configured: boolean
  account?: string
}

export type UserConnectionSaveInput = {
  kind: string
  fields: Record<string, string>
  apiKey: string
}

const now = (): number => Date.now()

const isConfigured = (row: StoredConnection | undefined): boolean =>
  Boolean(row?.api_key_ciphertext && row.api_key_iv && row.api_key_tag)

const parseFields = (fieldsJson: string): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(fieldsJson)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    const fields: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') fields[key] = value
    }
    return fields
  } catch {
    return {}
  }
}

const requireKind = (kind: string): UserConnectionKind => {
  if (!(kinds as readonly string[]).includes(kind))
    throw new Error(`Unknown connection kind: ${kind}`)
  return kind as UserConnectionKind
}

export type UserConnectionStore = {
  get(userId: string, kind: string): PublicUserConnection
  save(userId: string, input: UserConnectionSaveInput): PublicUserConnection
  clear(userId: string, kind: string): PublicUserConnection
  loadSecret(
    userId: string,
    kind: string,
  ): { secret: string; fields: Record<string, string> } | undefined
}

export function createUserConnections(sqlite: Sqlite): UserConnectionStore {
  const read = (
    userId: string,
    kind: string,
  ): StoredConnection | undefined =>
    sqlite
      .prepare(
        `SELECT user_id, kind, fields_json, api_key_ciphertext, api_key_iv, api_key_tag, created_at
         FROM user_connection WHERE user_id = ? AND kind = ?`,
      )
      .get(userId, kind) as StoredConnection | undefined

  const publicFor = (
    userId: string,
    kind: UserConnectionKind,
  ): PublicUserConnection => {
    const row = read(userId, kind)
    const fields = row ? parseFields(row.fields_json) : {}
    return {
      kind,
      configured: isConfigured(row),
      ...(fields.account ? { account: fields.account } : {}),
    }
  }

  return {
    get(userId, kindId) {
      return publicFor(userId, requireKind(kindId))
    },

    save(userId, input) {
      const kind = requireKind(input.kind)
      const account = input.fields.account?.trim()
      if (!account) throw new Error('Outlook account is required')
      const secret = encrypt(input.apiKey)
      const current = read(userId, kind)
      const timestamp = now()
      sqlite
        .prepare(
          `INSERT INTO user_connection
             (user_id, kind, fields_json, api_key_ciphertext, api_key_iv, api_key_tag, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, kind) DO UPDATE SET
             fields_json = excluded.fields_json,
             api_key_ciphertext = excluded.api_key_ciphertext,
             api_key_iv = excluded.api_key_iv,
             api_key_tag = excluded.api_key_tag,
             updated_at = excluded.updated_at`,
        )
        .run(
          userId,
          kind,
          JSON.stringify({ account }),
          secret.ciphertext,
          secret.iv,
          secret.tag,
          current?.created_at ?? timestamp,
          timestamp,
        )
      return publicFor(userId, kind)
    },

    clear(userId, kindId) {
      const kind = requireKind(kindId)
      sqlite
        .prepare(
          `DELETE FROM user_connection WHERE user_id = ? AND kind = ?`,
        )
        .run(userId, kind)
      return publicFor(userId, kind)
    },

    loadSecret(userId, kindId) {
      const kind = requireKind(kindId)
      const row = read(userId, kind)
      if (!isConfigured(row)) return undefined
      return {
        secret: decrypt({
          api_key_ciphertext: row!.api_key_ciphertext!,
          api_key_iv: row!.api_key_iv!,
          api_key_tag: row!.api_key_tag!,
        }),
        fields: parseFields(row!.fields_json),
      }
    },
  }
}
