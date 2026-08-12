import {
  currentServerBase,
  isTauriRuntime,
} from '#/lib/server-config'
import { formatIssueId } from '#/server/features/issues/issue-model'

/** Shareable link for an Issue (`/issues/COL-N`, or `sweat://issue/…` in Tauri). */
export function formatIssueDeepLink(number: number): string {
  const ref = formatIssueId(number)
  const path = `/issues/${encodeURIComponent(ref)}`
  if (!isTauriRuntime()) return new URL(path, window.location.origin).toString()

  const url = new URL(`sweat://issue/${encodeURIComponent(ref)}`)
  const server = currentServerBase()
  if (server) url.searchParams.set('server', server.replace(/\/$/, ''))
  return url.toString()
}

// ponytail: parse only; wire sweat://issue open into invite deep-link init when desktop share needs it
export function parseIssueDeepLink(
  value: string,
): { ref: string; server?: string } | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'sweat:' || url.hostname !== 'issue') return
    const ref = decodeURIComponent(url.pathname.slice(1))
    if (!ref || ref.includes('/')) return
    const serverParam = url.searchParams.get('server')
    if (!serverParam) return { ref }
    const server = new URL(serverParam)
    if (
      (server.protocol !== 'http:' && server.protocol !== 'https:') ||
      server.username ||
      server.password
    )
      return
    return { ref, server: server.toString().replace(/\/$/, '') }
  } catch {
    return undefined
  }
}
