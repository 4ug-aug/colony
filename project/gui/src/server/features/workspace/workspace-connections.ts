import {
  connectionKindPublic,
  getConnectionKind,
  listConnectionKinds,
  type ConnectionKindPublic,
} from '../../../../../connections/registry'
import type { WorkspaceAgentAdapter } from '../../../../../agents/roster'
import { capabilityPresentation } from '../../../../../agents/roster-people'
import {
  createSecretBox,
  type EncryptedSecretColumns,
} from '#/server/secret-box'

type Sqlite = {
  prepare(sql: string): {
    get(...values: unknown[]): unknown
    all(...values: unknown[]): unknown[]
    run(...values: unknown[]): unknown
  }
}

const { encrypt, decrypt } = createSecretBox('sweat-workspace-connections')

type StoredConnection = {
  kind: string
  fields_json: string
  api_key_ciphertext: string | null
  api_key_iv: string | null
  api_key_tag: string | null
  created_at?: number
}

export type PublicConnection = {
  id: string
  name: string
  icon: string
  capabilityId: string
  tools: readonly string[]
  secretLabel: string
  fieldSchema: ConnectionKindPublic['fields']
  configured: boolean
  values: Record<string, string>
  linkedAgentIds: string[]
}

export type ConnectionSaveInput = {
  kind: string
  fields: Record<string, unknown>
  apiKey?: string
}

const now = (): number => Date.now()

const isConfigured = (row: StoredConnection | undefined): boolean =>
  Boolean(
    row?.api_key_ciphertext && row.api_key_iv && row.api_key_tag,
  )

const parseFields = (fieldsJson: string): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(fieldsJson)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    const fields: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') fields[key] = value
    }
    return fields
  } catch {
    return {}
  }
}

export type WorkspaceConnectionStore = {
  list(): PublicConnection[]
  save(input: ConnectionSaveInput): PublicConnection
  clear(kind: string): PublicConnection
  setLinks(kind: string, agentDefinitionIds: readonly string[]): string[]
  listLinkedAgentIds(kind: string): string[]
  listLinksByAgent(): Record<string, string[]>
  adaptersForAgent(agentDefinitionId: string): WorkspaceAgentAdapter[]
}

export function createWorkspaceConnections(
  sqlite: Sqlite,
): WorkspaceConnectionStore {
  const read = (kind: string): StoredConnection | undefined =>
    sqlite
      .prepare(
        `SELECT kind, fields_json, api_key_ciphertext, api_key_iv, api_key_tag, created_at
         FROM workspace_connection WHERE kind = ?`,
      )
      .get(kind) as StoredConnection | undefined

  const listLinkedAgentIds = (kind: string): string[] =>
    (
      sqlite
        .prepare(
          `SELECT agent_definition_id FROM agent_definition_connection
           WHERE kind = ? ORDER BY agent_definition_id`,
        )
        .all(kind) as { agent_definition_id: string }[]
    ).map((row) => row.agent_definition_id)

  const publicFor = (kindId: string): PublicConnection => {
    const kind = getConnectionKind(kindId)
    if (!kind) throw new Error(`Unknown connection kind: ${kindId}`)
    const row = read(kindId)
    const meta = connectionKindPublic(kind)
    const presentation = capabilityPresentation[meta.capabilityId]
    return {
      id: meta.id,
      name: meta.name,
      icon: meta.icon,
      capabilityId: meta.capabilityId,
      tools: meta.tools.map((tool) => presentation?.tools[tool] ?? tool),
      secretLabel: meta.secretLabel,
      fieldSchema: meta.fields,
      configured: isConfigured(row),
      values: row ? parseFields(row.fields_json) : {},
      linkedAgentIds: listLinkedAgentIds(kindId),
    }
  }

  const deleteLinks = (kind: string): void => {
    sqlite
      .prepare(`DELETE FROM agent_definition_connection WHERE kind = ?`)
      .run(kind)
  }

  return {
    list() {
      return listConnectionKinds().map((kind) => publicFor(kind.id))
    },

    save(input) {
      const kind = getConnectionKind(input.kind)
      if (!kind) throw new Error(`Unknown connection kind: ${input.kind}`)
      const current = read(kind.id)
      const parsed = kind.parseAndValidate({
        fields: input.fields,
        apiKey: input.apiKey,
        hasExistingSecret: isConfigured(current),
      })
      const secret = parsed.apiKey ? encrypt(parsed.apiKey) : undefined
      if (!secret && !current)
        throw new Error(`${kind.secretLabel} is required`)
      const timestamp = now()
      const fieldsJson = JSON.stringify(parsed.fields)
      sqlite
        .prepare(
          `INSERT INTO workspace_connection
             (kind, fields_json, api_key_ciphertext, api_key_iv, api_key_tag, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(kind) DO UPDATE SET
             fields_json = excluded.fields_json,
             api_key_ciphertext = excluded.api_key_ciphertext,
             api_key_iv = excluded.api_key_iv,
             api_key_tag = excluded.api_key_tag,
             updated_at = excluded.updated_at`,
        )
        .run(
          kind.id,
          fieldsJson,
          secret?.ciphertext ?? current!.api_key_ciphertext,
          secret?.iv ?? current!.api_key_iv,
          secret?.tag ?? current!.api_key_tag,
          current?.created_at ?? timestamp,
          timestamp,
        )
      return publicFor(kind.id)
    },

    clear(kindId) {
      const kind = getConnectionKind(kindId)
      if (!kind) throw new Error(`Unknown connection kind: ${kindId}`)
      const current = read(kindId)
      if (!current) return publicFor(kindId)
      deleteLinks(kindId)
      sqlite
        .prepare(
          `UPDATE workspace_connection
           SET api_key_ciphertext = NULL,
               api_key_iv = NULL,
               api_key_tag = NULL,
               updated_at = ?
           WHERE kind = ?`,
        )
        .run(now(), kindId)
      return publicFor(kindId)
    },

    setLinks(kindId, agentDefinitionIds) {
      const kind = getConnectionKind(kindId)
      if (!kind) throw new Error(`Unknown connection kind: ${kindId}`)
      if (!isConfigured(read(kindId)))
        throw new Error(
          `${kind.name} must be configured before linking agents`,
        )
      const unique = [...new Set(agentDefinitionIds)]
      deleteLinks(kindId)
      const insert = sqlite.prepare(
        `INSERT INTO agent_definition_connection (agent_definition_id, kind)
         VALUES (?, ?)`,
      )
      for (const agentDefinitionId of unique) {
        insert.run(agentDefinitionId, kindId)
      }
      return listLinkedAgentIds(kindId)
    },

    listLinkedAgentIds,

    listLinksByAgent() {
      const rows = sqlite
        .prepare(
          `SELECT agent_definition_id, kind FROM agent_definition_connection
           ORDER BY agent_definition_id, kind`,
        )
        .all() as { agent_definition_id: string; kind: string }[]
      const byAgent: Record<string, string[]> = {}
      for (const row of rows) {
        const list = byAgent[row.agent_definition_id] ?? []
        list.push(row.kind)
        byAgent[row.agent_definition_id] = list
      }
      return byAgent
    },

    adaptersForAgent(agentDefinitionId) {
      const kinds = (
        sqlite
          .prepare(
            `SELECT c.kind, c.fields_json, c.api_key_ciphertext, c.api_key_iv, c.api_key_tag
             FROM agent_definition_connection AS link
             JOIN workspace_connection AS c ON c.kind = link.kind
             WHERE link.agent_definition_id = ?`,
          )
          .all(agentDefinitionId) as StoredConnection[]
      ).filter(isConfigured)

      return kinds.flatMap((row) => {
        const kind = getConnectionKind(row.kind)
        if (!kind) return []
        const secret: EncryptedSecretColumns = {
          api_key_ciphertext: row.api_key_ciphertext!,
          api_key_iv: row.api_key_iv!,
          api_key_tag: row.api_key_tag!,
        }
        const adapter = kind.createAdapter({
          fields: parseFields(row.fields_json),
          apiKey: decrypt(secret),
        })
        if (!adapter.capability) return [adapter]
        return [
          {
            ...adapter,
            capability: {
              ...adapter.capability,
              tools: kind.tools,
            },
          },
        ]
      })
    },
  }
}
