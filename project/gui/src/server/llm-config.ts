import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto'

import type { OpenAICompatibleModel } from '../../../runtime/openai-agents'

type Sqlite = {
  prepare(sql: string): {
    get(...values: unknown[]): unknown
    run(...values: unknown[]): unknown
  }
}

type StoredConfig = {
  base_url: string
  model: string
  api_key_ciphertext: string
  api_key_iv: string
  api_key_tag: string
}

export type PublicLlmConfig = {
  configured: boolean
  baseUrl?: string
  model?: string
}

export type LlmConfigInput = {
  baseUrl: string
  model: string
  apiKey?: string
}

const encryptionKey = (): Buffer => {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required')
  return Buffer.from(
    hkdfSync('sha256', secret, 'sweat-llm-config', 'api-key-encryption', 32),
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

const validBaseUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString().replace(/\/$/, '')
      : undefined
  } catch {
    return undefined
  }
}

const validModel = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() && value.trim().length <= 200
    ? value.trim()
    : undefined

export function createWorkspaceLlmConfig(sqlite: Sqlite) {
  const read = (): StoredConfig | undefined =>
    sqlite
      .prepare(
        'SELECT base_url, model, api_key_ciphertext, api_key_iv, api_key_tag FROM workspace_llm_config WHERE id = 1',
      )
      .get() as StoredConfig | undefined

  return {
    public(): PublicLlmConfig {
      const config = read()
      return config
        ? { configured: true, baseUrl: config.base_url, model: config.model }
        : { configured: false }
    },
    save(input: LlmConfigInput): PublicLlmConfig {
      const baseUrl = validBaseUrl(input.baseUrl)
      const model = validModel(input.model)
      const current = read()
      const apiKey = input.apiKey?.trim()
      if (!baseUrl || !model || (!current && !apiKey))
        throw new Error('Base URL, model, and API key are required')
      const secret = apiKey ? encrypted(apiKey) : undefined
      sqlite
        .prepare(
          `INSERT INTO workspace_llm_config
             (id, base_url, model, api_key_ciphertext, api_key_iv, api_key_tag)
           VALUES (1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             base_url = excluded.base_url,
             model = excluded.model,
             api_key_ciphertext = excluded.api_key_ciphertext,
             api_key_iv = excluded.api_key_iv,
             api_key_tag = excluded.api_key_tag`,
        )
        .run(
          baseUrl,
          model,
          secret?.ciphertext ?? current!.api_key_ciphertext,
          secret?.iv ?? current!.api_key_iv,
          secret?.tag ?? current!.api_key_tag,
        )
      return { configured: true, baseUrl, model }
    },
    model(): OpenAICompatibleModel {
      const config = read()
      if (!config) throw new Error('LLM provider is not configured')
      return {
        baseUrl: config.base_url,
        model: config.model,
        apiKey: decrypted(config),
      }
    },
  }
}
