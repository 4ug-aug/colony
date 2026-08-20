import type { WorkspaceAgentAdapter } from '../agents/roster'
import {
  createAsanaSoftwareEngineerAdapter,
  createGrafanaAdapter,
  createOutlineAdapter,
} from '../agents/software-engineer-adapters'

export type ConnectionFieldKind = 'text' | 'url'

export type ConnectionField = {
  key: string
  label: string
  kind: ConnectionFieldKind
}

export type ConnectionAuth = 'secret' | 'oauth'

export type ConnectionKindPublic = {
  id: string
  name: string
  icon: string
  capabilityId: string
  tools: readonly string[]
  secretLabel: string
  fields: readonly ConnectionField[]
  auth?: ConnectionAuth
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
    persistSecret?: (apiKey: string) => void
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

const kinds: readonly ConnectionKind[] = [asanaKind, outlineKind, grafanaKind]

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
    auth: kind.auth ?? 'secret',
  }
}
