export { formatIssueId } from '#/server/issue-model'

export function formatIssueCreatedAt(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(createdAt)
}
