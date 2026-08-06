import { useCallback, useState } from 'react'
import {
  ISSUE_FILTERS_STORAGE_KEY,
  parseStoredIssueFilters,
  serializeIssueFilters,
  type IssueListFilters,
} from './issue-filters'

/** Issue list filters mirrored into localStorage so they survive view changes. */
export function useStoredIssueFilters() {
  const [filters, setFilters] = useState<IssueListFilters>(() =>
    parseStoredIssueFilters(localStorage.getItem(ISSUE_FILTERS_STORAGE_KEY)),
  )

  const store = useCallback((next: IssueListFilters) => {
    setFilters({
      assignedToMe: next.assignedToMe,
      priorities: next.priorities,
      tags: next.tags,
      statuses: next.statuses,
    })
    localStorage.setItem(ISSUE_FILTERS_STORAGE_KEY, serializeIssueFilters(next))
  }, [])

  return [filters, store] as const
}
