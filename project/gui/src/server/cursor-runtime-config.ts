import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto'

import type { CursorRuntimeConfig } from '../../../agents/definition'

type Sqlite = {
  prepare(sql: string): {
    get(...values: unknown[]): unknown
    run(...values: unknown[]): unknown
  }
}

type StoredConfig = {
  model: string
  api_key_ciphertext: string
  api_key_iv: string
  api_key_tag: string
}

export type PublicCursorRuntimeConfig = {
  configured: boolean
  model?: string
}

export type CursorRuntimeConfigInput = {
  model: string
  apiKey?: string
}

export type CursorModelSummary = {
  id: string
  displayName: string
}

export type ListCursorModels = (
  apiKey: string,
) => Promise<readonly CursorModelSummary[]>

const encryptionKey = (): Buffer => {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required')
  return Buffer.from(
    hkdfSync(
      'sha256',
      secret,
      'sweat-cursor-runtime-config',
      'api-key-encryption',
      32,
    ),
  )
}

const encrypted = (value: string) => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}

const decrypted = (value: StoredConfig): string => {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(value.api_key_iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(value.api_key_tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(value.api_key_ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

const validModel = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() && value.trim().length <= 200
    ? value.trim()
    : undefined

export const defaultListCursorModels: ListCursorModels = async (apiKey) => {
  const { Cursor } = await import('@cursor/sdk')
  const models = await Cursor.models.list({ apiKey })
  return models.map((model) => ({
    id: model.id,
    displayName: model.displayName || model.id,
  }))
}

export function createWorkspaceCursorRuntimeConfig(
  sqlite: Sqlite,
  options: { listModels?: ListCursorModels } = {},
) {
  const listModels = options.listModels ?? defaultListCursorModels

  const read = (): StoredConfig | undefined =>
    sqlite
      .prepare(
        'SELECT model, api_key_ciphertext, api_key_iv, api_key_tag FROM workspace_cursor_runtime_config WHERE id = 1',
      )
      .get() as StoredConfig | undefined

  return {
    public(): PublicCursorRuntimeConfig {
      const config = read()
      return config
        ? { configured: true, model: config.model }
        : { configured: false }
    },
    async listModels(): Promise<CursorModelSummary[]> {
      const config = read()
      if (!config) throw new Error('Cursor agent runtime is not configured')
      return [...(await listModels(decrypted(config)))]
    },
    async save(input: CursorRuntimeConfigInput): Promise<PublicCursorRuntimeConfig> {
      const model = validModel(input.model)
      const current = read()
      const apiKey = input.apiKey?.trim()
      if (!model || (!current && !apiKey))
        throw new Error('Model and API key are required')
      const resolvedKey = apiKey || decrypted(current!)
      const catalog = await listModels(resolvedKey)
      if (!catalog.some((entry) => entry.id === model)) {
        throw new Error(
          `Model "${model}" is not available for this Cursor API key`,
        )
      }
      const secret = apiKey ? encrypted(apiKey) : undefined
      sqlite
        .prepare(
          `INSERT INTO workspace_cursor_runtime_config
             (id, model, api_key_ciphertext, api_key_iv, api_key_tag)
           VALUES (1, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             model = excluded.model,
             api_key_ciphertext = excluded.api_key_ciphertext,
             api_key_iv = excluded.api_key_iv,
             api_key_tag = excluded.api_key_tag`,
        )
        .run(
          model,
          secret?.ciphertext ?? current!.api_key_ciphertext,
          secret?.iv ?? current!.api_key_iv,
          secret?.tag ?? current!.api_key_tag,
        )
      return { configured: true, model }
    },
    cursor(): CursorRuntimeConfig {
      const config = read()
      if (!config) throw new Error('Cursor agent runtime is not configured')
      return {
        model: config.model,
        apiKey: decrypted(config),
      }
    },
  }
}
