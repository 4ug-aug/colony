import type { TransactionalSqlite } from '#/server/secret-box'

export type PreviewConfiguration = {
  initCommand?: string
  previewCommand: string
  guestPort: number
  graceDurationMs: number
}

export type PublicPreviewConfig = {
  configured: boolean
  initCommand?: string
  previewCommand?: string
  guestPort: number
  graceDurationMs: number
}

export type PreviewConfigInput = {
  initCommand?: string
  previewCommand?: string
  guestPort: unknown
  graceDurationMs: unknown
}

type StoredConfig = {
  init_command: string | null
  preview_command: string | null
  guest_port: number
  grace_duration_ms: number
}

export const DEFAULT_PREVIEW_GUEST_PORT = 3000
export const DEFAULT_PREVIEW_GRACE_MS = 5 * 60 * 1000

const optionalCommand = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const guestPort = (value: unknown): number | undefined => {
  const port =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined
}

const graceDurationMs = (value: unknown): number | undefined => {
  const ms =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN
  return Number.isInteger(ms) && ms >= 0 ? ms : undefined
}

const toPublic = (row: StoredConfig | undefined): PublicPreviewConfig => {
  const previewCommand = row?.preview_command?.trim() || undefined
  return {
    configured: Boolean(previewCommand),
    ...(row?.init_command?.trim()
      ? { initCommand: row.init_command.trim() }
      : {}),
    ...(previewCommand ? { previewCommand } : {}),
    guestPort: row?.guest_port ?? DEFAULT_PREVIEW_GUEST_PORT,
    graceDurationMs: row?.grace_duration_ms ?? DEFAULT_PREVIEW_GRACE_MS,
  }
}

export function createWorkspacePreviewConfig(sqlite: TransactionalSqlite) {
  const read = (): StoredConfig | undefined =>
    sqlite
      .prepare(
        'SELECT init_command, preview_command, guest_port, grace_duration_ms FROM workspace_preview_config WHERE id = 1',
      )
      .get() as StoredConfig | undefined

  return {
    public(): PublicPreviewConfig {
      return toPublic(read())
    },
    save(input: PreviewConfigInput): PublicPreviewConfig {
      const port = guestPort(input.guestPort)
      const grace = graceDurationMs(input.graceDurationMs)
      if (port === undefined || grace === undefined) {
        throw new Error('Guest port and grace duration are required')
      }
      const initCommand = optionalCommand(input.initCommand) ?? null
      const previewCommand = optionalCommand(input.previewCommand) ?? null
      sqlite
        .prepare(
          `INSERT INTO workspace_preview_config
             (id, init_command, preview_command, guest_port, grace_duration_ms)
           VALUES (1, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             init_command = excluded.init_command,
             preview_command = excluded.preview_command,
             guest_port = excluded.guest_port,
             grace_duration_ms = excluded.grace_duration_ms`,
        )
        .run(initCommand, previewCommand, port, grace)
      return toPublic(read())
    },
    preview(): PreviewConfiguration | undefined {
      const row = read()
      const previewCommand = row?.preview_command?.trim()
      if (!row || !previewCommand) return undefined
      return {
        ...(row.init_command?.trim()
          ? { initCommand: row.init_command.trim() }
          : {}),
        previewCommand,
        guestPort: row.guest_port,
        graceDurationMs: row.grace_duration_ms,
      }
    },
  }
}
