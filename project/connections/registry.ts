import type { WorkspaceAgentAdapter } from '../agents/roster'
import {
  createAsanaSoftwareEngineerAdapter,
  createGrafanaAdapter,
  createOutlineAdapter,
  createPostgresAdapter,
} from '../agents/software-engineer-adapters'
import { POSTGRES_TOOLS } from '../mcp/postgres'

export type ConnectionFieldKind = 'text' | 'url' | 'select'

export type ConnectionSelectOption = {
  value: string
  label: string
}

export type ConnectionField = {
  key: string
  label: string
  kind: ConnectionFieldKind
  options?: readonly ConnectionSelectOption[]
}

export type ConnectionKindPublic = {
  id: string
  name: string
  icon: string
  capabilityId: string
  tools: readonly string[]
  secretLabel: string
  fields: readonly ConnectionField[]
}

export type ParsedConnectionConfig = {
  fields: Record<string, string>
  apiKey?: string
}

export type ConnectionKind = ConnectionKindPublic & {
  parseAndValidate(input: {
    fields: Record<string, unknown>
    apiKey?: string
    hasExistingSecret: boolean
  }): ParsedConnectionConfig
  createAdapter(config: {
    fields: Record<string, string>
    apiKey: string
  }): WorkspaceAgentAdapter
}

const nonEmpty = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} is required`)
  return value.trim()
}

const validUrl = (value: unknown, label: string): string => {
  const raw = nonEmpty(value, label)
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new Error(`${label} must be an http(s) URL`)
    return url.toString().replace(/\/$/, '')
  } catch (error) {
    if (error instanceof Error && error.message.includes('http(s)')) throw error
    throw new Error(`${label} must be a valid URL`)
  }
}

const requireSecret = (
  apiKey: string | undefined,
  hasExistingSecret: boolean,
  label: string,
): string | undefined => {
  const trimmed = apiKey?.trim()
  if (trimmed) return trimmed
  if (hasExistingSecret) return undefined
  throw new Error(`${label} is required`)
}

const asanaTools = [
  'asana.get_project',
  'asana.create_task',
  'asana.list_tasks',
  'asana.get_task',
  'asana.get_task_comments',
  'asana.set_task_completion',
  'asana.add_task_comment',
] as const

const outlineTools = [
  'outline.list_documents',
  'outline.fetch',
  'outline.list_collections',
  'outline.create_document',
  'outline.update_document',
] as const

const grafanaTools = [
  'grafana.search_dashboards',
  'grafana.get_dashboard_summary',
  'grafana.get_dashboard_property',
  'grafana.get_dashboard_panel_queries',
  'grafana.list_datasources',
  'grafana.get_datasource',
  'grafana.query_prometheus',
  'grafana.list_prometheus_metric_metadata',
  'grafana.list_prometheus_metric_names',
  'grafana.list_prometheus_label_names',
  'grafana.list_prometheus_label_values',
  'grafana.query_loki_logs',
  'grafana.list_loki_label_names',
  'grafana.list_loki_label_values',
  'grafana.query_loki_stats',
  'grafana.list_alert_groups',
  'grafana.get_alert_group',
] as const

const oneOf = (
  value: unknown,
  options: readonly string[],
  label: string,
  fallback: string,
): string => {
  if (typeof value === 'string' && options.includes(value)) return value
  if (value === undefined || value === '') return fallback
  throw new Error(`${label} is required`)
}

const postgresPort = (value: unknown): string => {
  const raw =
    typeof value === 'string' && value.trim() ? value.trim() : '5432'
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Postgres port must be an integer from 1 to 65535')
  return String(port)
}

const asanaKind: ConnectionKind = {
  id: 'asana',
  name: 'Asana',
  icon: '/icons/asana.svg',
  capabilityId: 'asana.tasks',
  tools: asanaTools,
  secretLabel: 'API token',
  fields: [{ key: 'projectGid', label: 'Project GID', kind: 'text' }],
  parseAndValidate({ fields, apiKey, hasExistingSecret }) {
    return {
      fields: {
        projectGid: nonEmpty(fields.projectGid, 'Asana project GID'),
      },
      apiKey: requireSecret(apiKey, hasExistingSecret, 'Asana API token'),
    }
  },
  createAdapter({ fields, apiKey }) {
    return createAsanaSoftwareEngineerAdapter({
      apiToken: apiKey,
      projectGid: fields.projectGid!,
    })
  },
}

const outlineKind: ConnectionKind = {
  id: 'outline',
  name: 'Outline',
  icon: '/icons/outline.svg',
  capabilityId: 'outline.documents',
  tools: outlineTools,
  secretLabel: 'API key',
  fields: [
    {
      key: 'url',
      label: 'Instance URL (without /mcp)',
      kind: 'url',
    },
  ],
  parseAndValidate({ fields, apiKey, hasExistingSecret }) {
    return {
      fields: {
        url: validUrl(fields.url, 'Outline URL').replace(/\/mcp$/i, ''),
      },
      apiKey: requireSecret(apiKey, hasExistingSecret, 'Outline API key'),
    }
  },
  createAdapter({ fields, apiKey }) {
    return createOutlineAdapter({ url: fields.url!, apiKey })
  },
}

const grafanaKind: ConnectionKind = {
  id: 'grafana',
  name: 'Grafana',
  icon: '/icons/grafana.svg',
  capabilityId: 'grafana.observability',
  tools: grafanaTools,
  secretLabel: 'API key',
  fields: [{ key: 'url', label: 'MCP URL', kind: 'url' }],
  parseAndValidate({ fields, apiKey, hasExistingSecret }) {
    return {
      fields: { url: validUrl(fields.url, 'Grafana MCP URL') },
      apiKey: requireSecret(apiKey, hasExistingSecret, 'Grafana API key'),
    }
  },
  createAdapter({ fields, apiKey }) {
    return createGrafanaAdapter({ url: fields.url!, apiKey })
  },
}

const postgresKind: ConnectionKind = {
  id: 'postgres',
  name: 'Postgres',
  icon: '/icons/postgres.svg',
  capabilityId: 'postgres.sql',
  tools: POSTGRES_TOOLS,
  secretLabel: 'Password',
  fields: [
    { key: 'host', label: 'Host', kind: 'text' },
    { key: 'port', label: 'Port', kind: 'text' },
    { key: 'database', label: 'Database', kind: 'text' },
    { key: 'user', label: 'User', kind: 'text' },
    {
      key: 'sslmode',
      label: 'TLS',
      kind: 'select',
      options: [
        { value: 'require', label: 'Require TLS' },
        { value: 'disable', label: 'Disable TLS' },
      ],
    },
    {
      key: 'accessMode',
      label: 'Access',
      kind: 'select',
      options: [
        { value: 'read', label: 'Read' },
        {
          value: 'readwrite',
          label: 'Read and write (insert and update, never delete)',
        },
      ],
    },
  ],
  parseAndValidate({ fields, apiKey, hasExistingSecret }) {
    return {
      fields: {
        host: nonEmpty(fields.host, 'Postgres host'),
        port: postgresPort(fields.port),
        database: nonEmpty(fields.database, 'Postgres database'),
        user: nonEmpty(fields.user, 'Postgres user'),
        sslmode: oneOf(fields.sslmode, ['require', 'disable'], 'TLS', 'require'),
        accessMode: oneOf(
          fields.accessMode,
          ['read', 'readwrite'],
          'Access',
          'read',
        ),
      },
      apiKey: requireSecret(apiKey, hasExistingSecret, 'Postgres password'),
    }
  },
  createAdapter({ fields, apiKey }) {
    return createPostgresAdapter({
      host: fields.host!,
      port: Number(fields.port),
      database: fields.database!,
      user: fields.user!,
      password: apiKey,
      sslmode: fields.sslmode === 'disable' ? 'disable' : 'require',
      accessMode: fields.accessMode === 'readwrite' ? 'readwrite' : 'read',
    })
  },
}

const kinds: readonly ConnectionKind[] = [
  asanaKind,
  outlineKind,
  grafanaKind,
  postgresKind,
]

const byId = new Map(kinds.map((kind) => [kind.id, kind] as const))

export function listConnectionKinds(): readonly ConnectionKind[] {
  return kinds
}

export function getConnectionKind(id: string): ConnectionKind | undefined {
  return byId.get(id)
}

export function connectionKindPublic(
  kind: ConnectionKind,
): ConnectionKindPublic {
  return {
    id: kind.id,
    name: kind.name,
    icon: kind.icon,
    capabilityId: kind.capabilityId,
    tools: kind.tools,
    secretLabel: kind.secretLabel,
    fields: kind.fields,
  }
}
