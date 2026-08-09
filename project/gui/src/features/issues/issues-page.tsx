import { BrailleLoader } from '#/components/ui/braille-loader'
import { useWindowKeydown } from '#/hooks/use-window-keydown'
import { authClient } from '#/lib/auth-client'
import { useState } from 'react'
import { IssueCreateDialog } from './issue-create-dialog'
import { IssueDetailPage } from './issue-detail-page'
import { IssueFiltersBar } from './issue-filters-bar'
import { IssueBulkActions } from './issue-bulk-actions'
import { filterIssues, issueFiltersActive } from './issue-filters'
import type { IssueListFilters } from './issue-filters'
import { IssueList } from './issue-list'
import type { IssueStatus } from './types'
import { ISSUE_STATUSES } from './types'
import { useIssues } from './use-issues'
import { useStoredIssueFilters } from './use-stored-issue-filters'

export function IssuesPage({
  createOpen,
  createStatus,
  onCreateOpenChange,
}: {
  createOpen: boolean
  createStatus?: IssueStatus
  onCreateOpenChange: (open: boolean, status?: IssueStatus) => void
}) {
  const { data: session } = authClient.useSession()
  const accountId = session?.user.id
  const { data: issues = [], isPending, isError, error } = useIssues()
  const [selectedIssueId, setSelectedIssueId] = useState<string>()
  const [createParentId, setCreateParentId] = useState<string>()
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [filters, setFilters] = useStoredIssueFilters()

  const filtersWithAccount: IssueListFilters = {
    ...filters,
    accountId,
  }
  const visible = filterIssues(issues, filtersWithAccount)
  const selectedIssues = issues.filter((issue) =>
    selectedIssueIds.has(issue.id),
  )
  const filtersActive = issueFiltersActive(filtersWithAccount)
  const knownTags = [...new Set(issues.flatMap((issue) => issue.tags))].sort(
    (a, b) => a.localeCompare(b),
  )
  const visibleStatuses =
    filters.statuses.length > 0
      ? ISSUE_STATUSES.filter((status) => filters.statuses.includes(status))
      : ISSUE_STATUSES

  useWindowKeydown((event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'n')
      return
    if (event.altKey || event.shiftKey) return
    event.preventDefault()
    onCreateOpenChange(true)
  })

  const openCreate = (status?: IssueStatus, parentId?: string) => {
    setCreateParentId(parentId)
    onCreateOpenChange(true, status)
  }

  if (selectedIssueId) {
    return (
      <>
        <IssueDetailPage
          issueId={selectedIssueId}
          onBack={() => setSelectedIssueId(undefined)}
          onOpenIssue={setSelectedIssueId}
          onAddSubIssue={(parentId) => openCreate(undefined, parentId)}
        />
        <IssueCreateDialog
          open={createOpen}
          onOpenChange={(open) => {
            if (!open) setCreateParentId(undefined)
            onCreateOpenChange(open)
          }}
          defaultStatus={createStatus}
          defaultParentId={createParentId}
        />
      </>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isPending ? (
          <div
            className="flex justify-center py-12 text-sm text-muted-foreground"
            role="status"
          >
            <BrailleLoader text="Loading issues…" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive" role="alert">
            {error instanceof Error ? error.message : 'Unable to load issues'}
          </p>
        ) : (
          <>
            <IssueFiltersBar
              filters={filtersWithAccount}
              knownTags={knownTags}
              onChange={setFilters}
            />
            {visible.length === 0 && filtersActive ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No issues match these filters.
              </p>
            ) : (
              <IssueList
                issues={visible}
                visibleStatuses={visibleStatuses}
                hideEmptyGroups={filtersActive}
                onOpenIssue={setSelectedIssueId}
                onCreateInStatus={(status) => openCreate(status)}
                selectedIssueIds={selectedIssueIds}
                onIssueSelectedChange={(issueId, selected) =>
                  setSelectedIssueIds((current) => {
                    const next = new Set(current)
                    if (selected) next.add(issueId)
                    else next.delete(issueId)
                    return next
                  })
                }
              />
            )}
          </>
        )}
      </div>
      <IssueBulkActions
        issues={selectedIssues}
        onSelectionChange={(ids) => setSelectedIssueIds(new Set(ids))}
      />
      <IssueCreateDialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) setCreateParentId(undefined)
          onCreateOpenChange(open)
        }}
        defaultStatus={createStatus}
        defaultParentId={createParentId}
      />
    </div>
  )
}
