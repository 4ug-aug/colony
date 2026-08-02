import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto'

import {
  OPENAI_DEFAULT_BASE_URL,
  type OpenAICompatibleModel,
} from '../../../runtime/openai-agents'

export type LlmProvider = 'openai' | 'custom'

type Sqlite = {
  prepare(sql: string): {
    get(...values: unknown[]): unknown
    run(...values: unknown[]): unknown
  }
}

type StoredConfig = {
  provider: LlmProvider
  base_url: string
  model: string
  api_key_ciphertext: string
  api_key_iv: string
  api_key_tag: string
}

export type PublicLlmConfig = {
  configured: boolean
  provider?: LlmProvider
  baseUrl?: string
  model?: string
}

export type LlmConfigInput = {
  provider: unknown
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

const validProvider = (value: unknown): LlmProvider | undefined =>
  value === 'openai' || value === 'custom' ? value : undefined

const validModel = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() && value.trim().length <= 200
    ? value.trim()
    : undefined

export function createWorkspaceLlmConfig(sqlite: Sqlite) {
  const read = (): StoredConfig | undefined =>
    sqlite
      .prepare(
        'SELECT provider, base_url, model, api_key_ciphertext, api_key_iv, api_key_tag FROM workspace_llm_config WHERE id = 1',
      )
      .get() as StoredConfig | undefined

  return {
    public(): PublicLlmConfig {
      const config = read()
      return config
        ? {
            configured: true,
            provider: config.provider,
            baseUrl: config.base_url,
            model: config.model,
          }
        : { configured: false }
    },
    save(input: LlmConfigInput): PublicLlmConfig {
      const provider = validProvider(input.provider ?? 'openai')
      const baseUrl = validBaseUrl(
        input.baseUrl ||
          (provider === 'openai' ? OPENAI_DEFAULT_BASE_URL : undefined),
      )
      const model = validModel(input.model)
      const current = read()
      const apiKey = input.apiKey?.trim()
      if (!provider || !baseUrl || !model || (!current && !apiKey))
        throw new Error('Provider, base URL, model, and API key are required')
      const secret = apiKey ? encrypted(apiKey) : undefined
      sqlite
        .prepare(
          `INSERT INTO workspace_llm_config
             (id, provider, base_url, model, api_key_ciphertext, api_key_iv, api_key_tag)
           VALUES (1, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             provider = excluded.provider,
             base_url = excluded.base_url,
             model = excluded.model,
             api_key_ciphertext = excluded.api_key_ciphertext,
             api_key_iv = excluded.api_key_iv,
             api_key_tag = excluded.api_key_tag`,
        )
        .run(
          provider,
          baseUrl,
          model,
          secret?.ciphertext ?? current!.api_key_ciphertext,
          secret?.iv ?? current!.api_key_iv,
          secret?.tag ?? current!.api_key_tag,
        )
      return { configured: true, provider, baseUrl, model }
    },
    model(): OpenAICompatibleModel {
      const config = read()
      if (!config) throw new Error('LLM provider is not configured')
      return {
        provider: config.provider,
        baseUrl: config.base_url,
        model: config.model,
        apiKey: decrypted(config),
      }
    },
  }
}
