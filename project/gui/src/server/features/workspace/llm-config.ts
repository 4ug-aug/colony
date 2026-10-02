import {
    createSecretBox,
    type TransactionalSqlite,
} from '#/server/secret-box'
import {
    OPENAI_DEFAULT_BASE_URL,
    type OpenAICompatibleModel,
} from '#project/runtime/openai-agents'
import { z } from 'zod'

const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === 'string' && !value.trim())
    ? undefined
    : value

const contextTokensError =
  'Context window must be a whole number of tokens between 4,000 and 10,000,000'

const httpUrl = z
  .url({ protocol: /^https?$/, error: 'Base URL must be an http(s) URL' })
  .transform((url) => url.replace(/\/$/, ''))

/** What the settings form may send. Parse at the HTTP edge; parsing trims, coerces and fills defaults. */
export const llmConfigInput = z
  .object({
    provider: z
      .enum(['openai', 'custom'], { error: 'Provider must be openai or custom' })
      .default('openai'),
    baseUrl: z.preprocess(blankToUndefined, httpUrl.optional()),
    model: z
      .string({ error: 'Model is required' })
      .trim()
      .min(1, 'Model is required')
      .max(200, 'Model name is too long'),
    // Blank means the runtime default.
    contextTokens: z.preprocess(
      blankToUndefined,
      z.coerce
        .number({ error: contextTokensError })
        .int(contextTokensError)
        .min(4_000, contextTokensError)
        .max(10_000_000, contextTokensError)
        .optional(),
    ),
    apiKey: z.preprocess(blankToUndefined, z.string().trim().optional()),
  })
  .transform((input, context) => {
    const baseUrl =
      input.baseUrl ??
      (input.provider === 'openai' ? OPENAI_DEFAULT_BASE_URL : undefined)
    if (!baseUrl) {
      context.addIssue({ code: 'custom', message: 'Base URL is required' })
      return z.NEVER
    }
    return { ...input, baseUrl }
  })

export type LlmConfigInput = z.output<typeof llmConfigInput>
export type LlmProvider = LlmConfigInput['provider']

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

const { encrypt, decrypt } = createSecretBox('sweat-llm-config')

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
      const { provider, baseUrl, model, contextTokens, apiKey } = input
      const current = read()
      // The schema cannot see storage: only a first save must bring a key.
      if (!current && !apiKey) throw new Error('API key is required')
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
          contextTokens ?? null,
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
