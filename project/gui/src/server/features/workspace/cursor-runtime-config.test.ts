import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createWorkspaceCursorRuntimeConfig } from './cursor-runtime-config'

const createConfig = () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE workspace_cursor_runtime_config (
    id INTEGER PRIMARY KEY, model TEXT NOT NULL,
    api_key_ciphertext TEXT NOT NULL, api_key_iv TEXT NOT NULL, api_key_tag TEXT NOT NULL
  )`)
  const listModels = async (apiKey: string) => {
    if (apiKey !== 'secret-key' && apiKey !== 'rotated-key')
      throw new Error('bad key')
    return [
      { id: 'composer-2.5', displayName: 'Composer 2.5' },
      { id: 'auto', displayName: 'Auto' },
    ]
  }
  return {
    sqlite,
    config: createWorkspaceCursorRuntimeConfig(sqlite, { listModels }),
  }
}

test('stores an encrypted Cursor key and never exposes it publicly', async () => {
  const previous = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = 'test-secret'
  try {
    const { sqlite, config } = createConfig()
    expect(config.public()).toEqual({ configured: false })
    expect(
      await config.save({
        model: 'composer-2.5',
        apiKey: 'secret-key',
      }),
    ).toEqual({
      configured: true,
      model: 'composer-2.5',
    })
    expect(config.public()).not.toHaveProperty('apiKey')
    expect(
      sqlite
        .query('SELECT api_key_ciphertext FROM workspace_cursor_runtime_config')
        .get(),
    ).not.toEqual({ api_key_ciphertext: 'secret-key' })
    expect(config.cursor()).toEqual({
      model: 'composer-2.5',
      apiKey: 'secret-key',
    })
    await config.save({ model: 'auto' })
    expect(config.public()).toEqual({ configured: true, model: 'auto' })
    expect(config.cursor()).toMatchObject({
      model: 'auto',
      apiKey: 'secret-key',
    })
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = previous
  }
})

test('rejects models that are not in the Cursor catalog for the key', async () => {
  const previous = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = 'test-secret'
  try {
    const { config } = createConfig()
    await expect(
      config.save({
        model: 'not-a-real-model',
        apiKey: 'secret-key',
      }),
    ).rejects.toThrow(/not available/)
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = previous
  }
})
