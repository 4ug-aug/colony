import {
    createSecretBox,
    validModel,
    type TransactionalSqlite,
} from '#/server/secret-box'
import {
    OPENAI_DEFAULT_BASE_URL,
    type OpenAICompatibleModel,
} from '#project/runtime/openai-agents'

export type LlmProvider = 'openai' | 'custom'

type StoredConfig = {
  provider: LlmProvider
  base_url: string
  model: string
  context_tokens: number | null
  api_key_ciphertext: string
  api_key_iv: string
  api_key_tag: string
}

export type PublicLlmConfig = {
  configured: boolean
  provider?: LlmProvider
  baseUrl?: string
  model?: string
  contextTokens?: number
}

export type LlmConfigInput = {
  provider: unknown
  baseUrl: string
  model: string
  contextTokens?: unknown
  apiKey?: string
}

const { encrypt, decrypt } = createSecretBox('sweat-llm-config')

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

// Blank means the runtime default; otherwise a plausible window, 4k to 10M tokens.
const validContextTokens = (value: unknown): number | null | undefined => {
  if (value === undefined || value === null || value === '') return null
  const tokens = Number(value)
  return Number.isInteger(tokens) && tokens >= 4_000 && tokens <= 10_000_000
    ? tokens
    : undefined
}

const validProvider = (value: unknown): LlmProvider | undefined =>
  value === 'openai' || value === 'custom' ? value : undefined

export function createWorkspaceLlmConfig(sqlite: TransactionalSqlite) {
  const read = (): StoredConfig | undefined =>
    sqlite
      .prepare(
        'SELECT provider, base_url, model, context_tokens, api_key_ciphertext, api_key_iv, api_key_tag FROM workspace_llm_config WHERE id = 1',
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
            ...(config.context_tokens
              ? { contextTokens: config.context_tokens }
              : {}),
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
      const contextTokens = validContextTokens(input.contextTokens)
      if (contextTokens === undefined)
        throw new Error(
          'Context window must be a whole number of tokens between 4,000 and 10,000,000',
        )
      const current = read()
      const apiKey = input.apiKey?.trim()
      if (!provider || !baseUrl || !model || (!current && !apiKey))
        throw new Error('Provider, base URL, model, and API key are required')
      const secret = apiKey ? encrypt(apiKey) : undefined
      sqlite
        .prepare(
          `INSERT INTO workspace_llm_config
             (id, provider, base_url, model, context_tokens, api_key_ciphertext, api_key_iv, api_key_tag)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             provider = excluded.provider,
             base_url = excluded.base_url,
             model = excluded.model,
             context_tokens = excluded.context_tokens,
             api_key_ciphertext = excluded.api_key_ciphertext,
             api_key_iv = excluded.api_key_iv,
             api_key_tag = excluded.api_key_tag`,
        )
        .run(
          provider,
          baseUrl,
          model,
          contextTokens,
          secret?.ciphertext ?? current!.api_key_ciphertext,
          secret?.iv ?? current!.api_key_iv,
          secret?.tag ?? current!.api_key_tag,
        )
      return {
        configured: true,
        provider,
        baseUrl,
        model,
        ...(contextTokens ? { contextTokens } : {}),
      }
    },
    model(): OpenAICompatibleModel {
      const config = read()
      if (!config) throw new Error('LLM provider is not configured')
      return {
        provider: config.provider,
        baseUrl: config.base_url,
        model: config.model,
        ...(config.context_tokens
          ? { contextTokens: config.context_tokens }
          : {}),
        apiKey: decrypt(config),
      }
    },
  }
}
