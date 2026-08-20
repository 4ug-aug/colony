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
