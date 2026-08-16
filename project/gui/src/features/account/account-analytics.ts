import type { Issue, IssueStatus } from '#/features/issues/types'

const DAY = 86_400_000

export function countUpValue(from: number, to: number, progress: number) {
  const eased = 1 - (1 - Math.max(0, Math.min(progress, 1))) ** 3
  return Math.round(from + (to - from) * eased)
}

export function buildAccountAnalytics(
  issues: Issue[],
  accountId: string,
  now = Date.now(),
) {
  const owned = issues.filter(
    ({ owner }) => owner?.kind === 'account' && owner.id === accountId,
  )
  const opened = issues.filter(
    ({ createdBy }) =>
      createdBy?.kind === 'account' && createdBy.id === accountId,
  )
  const related = issues.filter(
    ({ owner, createdBy }) =>
      (owner?.kind === 'account' && owner.id === accountId) ||
      (createdBy?.kind === 'account' && createdBy.id === accountId),
  )
  const today = Math.floor(now / DAY)
  const rhythm = Array.from({ length: 7 }, (_, index) => {
    const bucket = today - 6 + index
    const date = new Date(bucket * DAY)
    return {
      day: new Intl.DateTimeFormat([], { weekday: 'short' }).format(date),
      opened: related.filter(
        ({ createdAt }) => Math.floor(createdAt / DAY) === bucket,
      ).length,
      touched: related.filter(
        ({ createdAt, updatedAt }) =>
          Math.floor(updatedAt / DAY) === bucket && updatedAt !== createdAt,
      ).length,
    }
  })
  const byStatus: Record<IssueStatus, number> = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
  }
  for (const issue of owned) byStatus[issue.status] += 1

  return {
    assigned: owned.length,
    opened: opened.length,
    active: byStatus.in_progress + byStatus.in_review,
    completed: byStatus.done,
    byStatus,
    rhythm,
  }
}
