export function formatIssueId(number: number): string {
  return `SWE-${number}`
}

export function formatIssueCreatedAt(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(createdAt)
}
