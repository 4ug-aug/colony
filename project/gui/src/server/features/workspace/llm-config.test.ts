import { migratedDatabase } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { createWorkspaceLlmConfig } from './llm-config'

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
      config.save({
        provider: 'openai',
        baseUrl: 'https://models.example/v1',
        model: 'test-model',
        apiKey: 'secret-key',
      }),
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
    config.save({
      provider: 'custom',
      baseUrl: 'http://localhost:11434/v1',
      model: 'other-model',
    })
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
      config.save({
        provider: 'openai',
        baseUrl: '',
        model: 'gpt-4.1-mini',
        apiKey: 'key',
      }),
    ).toMatchObject({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
    })
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = previous
  }
})
