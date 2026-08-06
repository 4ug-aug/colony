import type { Issue, IssuePriority, IssueStatus } from './types'
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from './types'

export type IssueListFilters = {
  assignedToMe: boolean
  accountId?: string
  priorities: IssuePriority[]
  tags: string[]
  statuses: IssueStatus[]
}

/** Persisted shape — accountId is session-derived, never stored. */
export type StoredIssueListFilters = {
  assignedToMe: boolean
  priorities: IssuePriority[]
  tags: string[]
  statuses: IssueStatus[]
}

export const EMPTY_ISSUE_FILTERS: IssueListFilters = {
  assignedToMe: false,
  priorities: [],
  tags: [],
  statuses: [],
}

export const ISSUE_FILTERS_STORAGE_KEY = 'issues.list.filters'

export function issueFiltersActive(filters: IssueListFilters): boolean {
  return (
    filters.assignedToMe ||
    filters.priorities.length > 0 ||
    filters.tags.length > 0 ||
    filters.statuses.length > 0
  )
}

function isIssuePriority(value: unknown): value is IssuePriority {
  return (
    typeof value === 'string' &&
    (ISSUE_PRIORITIES as readonly string[]).includes(value)
  )
}

function isIssueStatus(value: unknown): value is IssueStatus {
  return (
    typeof value === 'string' &&
    (ISSUE_STATUSES as readonly string[]).includes(value)
  )
}

/** Parse persisted filters; invalid/missing fields fall back to empty. */
export function parseStoredIssueFilters(raw: string | null): StoredIssueListFilters {
  if (!raw) return { ...EMPTY_ISSUE_FILTERS }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_ISSUE_FILTERS }
    const record = parsed as Record<string, unknown>
    const priorities = Array.isArray(record.priorities)
      ? record.priorities.filter(isIssuePriority)
      : []
    const statuses = Array.isArray(record.statuses)
      ? record.statuses.filter(isIssueStatus)
      : []
    const tags = Array.isArray(record.tags)
      ? record.tags.filter(
          (tag): tag is string => typeof tag === 'string' && tag.length > 0,
        )
      : []
    return {
      assignedToMe: record.assignedToMe === true,
      priorities,
      tags,
      statuses,
    }
  } catch {
    return { ...EMPTY_ISSUE_FILTERS }
  }
}

export function serializeIssueFilters(filters: IssueListFilters): string {
  const stored: StoredIssueListFilters = {
    assignedToMe: filters.assignedToMe,
    priorities: filters.priorities,
    tags: filters.tags,
    statuses: filters.statuses,
  }
  return JSON.stringify(stored)
}

export function filterIssues(
  issues: Issue[],
  filters: IssueListFilters,
): Issue[] {
  const prioritySet =
    filters.priorities.length > 0 ? new Set(filters.priorities) : undefined
  const statusSet =
    filters.statuses.length > 0 ? new Set(filters.statuses) : undefined
  const requiredTags = filters.tags

  return issues.filter((issue) => {
    if (filters.assignedToMe) {
      if (!filters.accountId) return false
      if (
        issue.owner?.kind !== 'account' ||
        issue.owner.id !== filters.accountId
      )
        return false
    }
    if (prioritySet && !prioritySet.has(issue.priority)) return false
    if (statusSet && !statusSet.has(issue.status)) return false
    if (
      requiredTags.length > 0 &&
      !requiredTags.every((tag) => issue.tags.includes(tag))
    )
      return false
    return true
  })
}
