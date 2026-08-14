import { formatIssueId } from '#/server/features/issues/issue-model'
import {
  ISSUE_PRIORITY_LABEL,
  ISSUE_STATUS_LABEL,
  type Issue,
} from './types'

export { formatIssueId }

export function formatIssueMarkdown(
  issue: Issue,
  options?: { assignee?: string },
): string {
  const heading = `# ${formatIssueId(issue.number)} ${issue.title}`
  const timeSpent = issue.timeSpent.reduce((sum, minutes) => sum + minutes, 0)
  const properties = [
    `- Status: ${ISSUE_STATUS_LABEL[issue.status]}`,
    `- Priority: ${ISSUE_PRIORITY_LABEL[issue.priority]}`,
    `- Assignee: ${
      options?.assignee ??
      (issue.owner ? `${issue.owner.kind}:${issue.owner.id}` : '—')
    }`,
    `- Creator: ${
      issue.createdBy ? `${issue.createdBy.kind}:${issue.createdBy.id}` : '—'
    }`,
    `- Branch: ${issue.effectiveBranch ?? '—'}`,
    `- Tags: ${issue.tags.length > 0 ? issue.tags.join(', ') : '—'}`,
    `- Time spent: ${timeSpent > 0 ? formatTimeSpentMinutes(timeSpent) : '—'}`,
  ]

  const sections = [heading, properties.join('\n')]
  const description = issue.description.trim()
  if (description) sections.push(`## Description\n\n${description}`)
  const deliverable = issue.deliverable.trim()
  if (deliverable) sections.push(`## Deliverable\n\n${deliverable}`)
  return sections.join('\n\n')
}

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
