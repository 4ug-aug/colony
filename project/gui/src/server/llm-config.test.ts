import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createWorkspaceLlmConfig } from './llm-config'

const createConfig = () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE workspace_llm_config (
    id INTEGER PRIMARY KEY, base_url TEXT NOT NULL, model TEXT NOT NULL,
    api_key_ciphertext TEXT NOT NULL, api_key_iv TEXT NOT NULL, api_key_tag TEXT NOT NULL
  )`)
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
        baseUrl: 'https://models.example/v1',
        model: 'test-model',
        apiKey: 'secret-key',
      }),
    ).toEqual({
      configured: true,
      baseUrl: 'https://models.example/v1',
      model: 'test-model',
    })
    expect(config.public()).not.toHaveProperty('apiKey')
    expect(
      sqlite.query('SELECT api_key_ciphertext FROM workspace_llm_config').get(),
    ).not.toEqual({ api_key_ciphertext: 'secret-key' })
    expect(config.model()).toEqual({
      baseUrl: 'https://models.example/v1',
      model: 'test-model',
      apiKey: 'secret-key',
    })
    config.save({ baseUrl: 'http://localhost:11434/v1', model: 'other-model' })
    expect(config.model().apiKey).toBe('secret-key')
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = previous
  }
})
