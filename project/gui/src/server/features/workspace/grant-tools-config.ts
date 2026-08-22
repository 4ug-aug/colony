import type { TransactionalSqlite } from '#/server/secret-box'
import type {
  CapabilityGrantMode,
  CapabilityGrantPolicy,
} from '#project/agents/grant-tools'

export type GrantToolsConfigInput = Record<string, unknown>

export type PublicGrantToolsConfig = {
  mode: CapabilityGrantMode
  tools: string[]
  bundles: Record<string, string[]>
}

type StoredConfig = {
  mode: CapabilityGrantMode
  tools_json: string
  bundles_json: string
}

const MODES: readonly CapabilityGrantMode[] = ['all', 'allowlist', 'model']

const empty: PublicGrantToolsConfig = {
  mode: 'all',
  tools: [],
  bundles: {},
}

const asMode = (value: unknown): CapabilityGrantMode => {
  if (typeof value === 'string' && MODES.includes(value as CapabilityGrantMode))
    return value as CapabilityGrantMode
  throw new Error('Mode must be all, allowlist, or model')
}

const asNames = (value: unknown, label: string): string[] => {
  if (value === undefined || value === null || value === '') return []
  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map((name) => name.trim())
      .filter(Boolean)
  }
  if (!Array.isArray(value)) throw new Error(`${label} must be a list of names`)
  const names = value.map((item) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(`${label} must be a list of names`)
    }
    return item.trim()
  })
  return names
}

export function parseBundleLines(text: string): Record<string, string[]> {
  const bundles: Record<string, string[]> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(':')
    if (colon <= 0) {
      throw new Error('Each bundle line is name: tool, tool')
    }
    const name = trimmed.slice(0, colon).trim()
    const tools = trimmed
      .slice(colon + 1)
      .split(',')
      .map((tool) => tool.trim())
      .filter(Boolean)
    if (!name || !tools.length) {
      throw new Error(`Bundle "${name}" needs at least one tool`)
    }
    bundles[name] = tools
  }
  return bundles
}

const asBundles = (value: unknown): Record<string, string[]> => {
  if (value === undefined || value === null || value === '') return {}
  if (typeof value === 'string') return parseBundleLines(value)
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Bundles must be an object or name: tool lines')
  }
  const bundles: Record<string, string[]> = {}
  for (const [key, tools] of Object.entries(value as Record<string, unknown>)) {
    const name = key.trim()
    if (!name) throw new Error('Bundle names must be non-empty')
    const parsed = asNames(tools, `Bundle "${name}"`)
    if (!parsed.length) throw new Error(`Bundle "${name}" needs at least one tool`)
    bundles[name] = parsed
  }
  return bundles
}

const readJson = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

const toPublic = (row: StoredConfig | undefined): PublicGrantToolsConfig => {
  if (!row) return empty
  return {
    mode: row.mode,
    tools: readJson<string[]>(row.tools_json, []),
    bundles: readJson<Record<string, string[]>>(row.bundles_json, {}),
  }
}

export function createWorkspaceGrantToolsConfig(sqlite: TransactionalSqlite) {
  const read = (): StoredConfig | undefined =>
    sqlite
      .prepare(
        'SELECT mode, tools_json, bundles_json FROM workspace_grant_tools WHERE id = 1',
      )
      .get() as StoredConfig | undefined

  return {
    public(): PublicGrantToolsConfig {
      return toPublic(read())
    },
    save(input: GrantToolsConfigInput): PublicGrantToolsConfig {
      const mode = asMode(input.mode ?? 'all')
      const tools = asNames(input.tools, 'Tools')
      const bundles = asBundles(input.bundles)
      sqlite
        .prepare(
          `INSERT INTO workspace_grant_tools
             (id, mode, tools_json, bundles_json)
           VALUES (1, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             mode = excluded.mode,
             tools_json = excluded.tools_json,
             bundles_json = excluded.bundles_json`,
        )
        .run(mode, JSON.stringify(tools), JSON.stringify(bundles))
      return toPublic(read())
    },
    policy(): CapabilityGrantPolicy {
      const config = toPublic(read())
      return {
        mode: config.mode,
        ...(config.tools.length ? { tools: config.tools } : {}),
        ...(Object.keys(config.bundles).length ? { bundles: config.bundles } : {}),
      }
    },
  }
}
