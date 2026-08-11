import type { CursorRuntimeConfig } from '../../../../../agents/definition'
import {
  createSecretBox,
  validModel,
  type Sqlite,
} from '#/server/secret-box'

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

const { encrypt, decrypt } = createSecretBox('sweat-cursor-runtime-config')

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
      return [...(await listModels(decrypt(config)))]
    },
    async save(input: CursorRuntimeConfigInput): Promise<PublicCursorRuntimeConfig> {
      const model = validModel(input.model)
      const current = read()
      const apiKey = input.apiKey?.trim()
      if (!model || (!current && !apiKey))
        throw new Error('Model and API key are required')
      const resolvedKey = apiKey || decrypt(current!)
      const catalog = await listModels(resolvedKey)
      if (!catalog.some((entry) => entry.id === model)) {
        throw new Error(
          `Model "${model}" is not available for this Cursor API key`,
        )
      }
      const secret = apiKey ? encrypt(apiKey) : undefined
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
        apiKey: decrypt(config),
      }
    },
  }
}
