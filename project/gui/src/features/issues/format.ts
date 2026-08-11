export { formatIssueId } from '#/server/features/issues/issue-model'

export function formatIssueCreatedAt(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(createdAt)
}

/** Formats stored minutes as compact duration units, e.g. `45m`, `1h 30m`, `1d 2h`. */
export function formatTimeSpentMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  if (total === 0) return '0m'

  const days = Math.floor(total / (60 * 24))
  const hours = Math.floor((total % (60 * 24)) / 60)
  const mins = total % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`)
  return parts.join(' ')
}
