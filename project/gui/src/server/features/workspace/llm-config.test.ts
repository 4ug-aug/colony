import { migratedDatabase } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { createWorkspaceLlmConfig, llmConfigInput } from './llm-config'

/** The form body as the route receives it, parsed the way the route parses it. */
const input = (body: object) => llmConfigInput.parse(body)
const inputError = (body: object) =>
  llmConfigInput.safeParse(body).error?.issues[0]?.message

const createConfig = () => {
  const sqlite = migratedDatabase()
  return { sqlite, config: createWorkspaceLlmConfig(sqlite) }
}

test('stores an encrypted key and never exposes it publicly', () => {
  const previous = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = 'test-secret'
  try {
    const { sqlite, config } = createConfig()
    expect(config.public()).toEqual({ configured: false })
    expect(
      config.save(input({
        provider: 'openai',
        baseUrl: 'https://models.example/v1',
        model: 'test-model',
        apiKey: 'secret-key',
      })),
    ).toEqual({
      configured: true,
      provider: 'openai',
      baseUrl: 'https://models.example/v1',
      model: 'test-model',
    })
    expect(config.public()).not.toHaveProperty('apiKey')
    expect(
      sqlite.query('SELECT api_key_ciphertext FROM workspace_llm_config').get(),
    ).not.toEqual({ api_key_ciphertext: 'secret-key' })
    expect(config.model()).toEqual({
      provider: 'openai',
      baseUrl: 'https://models.example/v1',
      model: 'test-model',
      apiKey: 'secret-key',
    })
    config.save(input({
      provider: 'custom',
      baseUrl: 'http://localhost:11434/v1',
      model: 'other-model',
    }))
    expect(config.public()).toMatchObject({ provider: 'custom' })
    expect(config.model()).toMatchObject({
      provider: 'custom',
      baseUrl: 'http://localhost:11434/v1',
      model: 'other-model',
      apiKey: 'secret-key',
    })
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = previous
  }
})

test('OpenAI supplies its default base URL when the form leaves it blank', () => {
  const previous = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = 'test-secret'
  try {
    const { config } = createConfig()
    expect(
      config.save(input({
        provider: 'openai',
        baseUrl: '',
        model: 'gpt-4.1-mini',
        apiKey: 'key',
      })),
    ).toMatchObject({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
    })
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = previous
  }
})

test('the input schema coerces form values and explains what is wrong', () => {
  const base = { provider: 'custom', baseUrl: 'http://localhost:8000/v1/', model: ' qwen ' }
  expect(input({ ...base, contextTokens: '32768', apiKey: '' })).toEqual({
    provider: 'custom',
    baseUrl: 'http://localhost:8000/v1',
    model: 'qwen',
    contextTokens: 32768,
  })
  expect(input({ model: 'gpt', baseUrl: '' })).toMatchObject({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
  })
  expect(input({ ...base, contextTokens: '' }).contextTokens).toBeUndefined()
  expect(inputError({ ...base, contextTokens: '12.5' })).toContain('Context window')
  expect(inputError({ ...base, contextTokens: 100 })).toContain('Context window')
  expect(inputError({ ...base, baseUrl: 'ftp://models' })).toBe('Base URL must be an http(s) URL')
  expect(inputError({ ...base, baseUrl: '' })).toBe('Base URL is required')
  expect(inputError({ ...base, model: '  ' })).toBe('Model is required')
  expect(inputError({ ...base, provider: 'anthropic' })).toBe('Provider must be openai or custom')
})

test('stores the optional context window and requires a key on first save', () => {
  const previous = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = 'test-secret'
  try {
    const { config } = createConfig()
    const base = { provider: 'custom', baseUrl: 'http://localhost:8000/v1', model: 'qwen' }
    expect(() => config.save(input(base))).toThrow('API key is required')
    expect(config.save(input({ ...base, apiKey: 'k', contextTokens: 32768 }))).toMatchObject({ contextTokens: 32768 })
    expect(config.model().contextTokens).toBe(32768)
    expect(config.save(input(base))).not.toHaveProperty('contextTokens')
    expect(config.model()).not.toHaveProperty('contextTokens')
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = previous
  }
})
