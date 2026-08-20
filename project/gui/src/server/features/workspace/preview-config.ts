import type { TransactionalSqlite } from '#/server/secret-box'
import type { PreviewConfiguration } from '#project/runs'

export type { PreviewConfiguration }

export type PublicPreviewConfig = {
  configured: boolean
  initCommand?: string
  previewCommand?: string
  guestPort: number
  graceDurationMs: number
}

/** The raw request body: this store is the validating boundary. */
export type PreviewConfigInput = Record<string, unknown>

type StoredConfig = {
  init_command: string | null
  preview_command: string | null
  guest_port: number
  grace_duration_ms: number
}

export const DEFAULT_PREVIEW_GUEST_PORT = 3000
export const DEFAULT_PREVIEW_GRACE_MS = 5 * 60 * 1000
/** A sandbox held past this is a leak, not a Preview. */
export const MAX_PREVIEW_GRACE_MS = 24 * 60 * 60 * 1000

const optionalCommand = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/** Reads a bounded integer, naming the field so a rejection can explain itself. */
const boundedInteger = (
  field: string,
  value: unknown,
  min: number,
  max: number,
): number => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} must be a whole number between ${min} and ${max}`)
  }
  return parsed
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
      const port = boundedInteger('Guest port', input.guestPort, 1, 65535)
      const grace = boundedInteger(
        'Grace duration',
        input.graceDurationMs,
        0,
        MAX_PREVIEW_GRACE_MS,
      )
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
