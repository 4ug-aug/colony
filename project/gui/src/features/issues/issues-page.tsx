import { BrailleLoader } from '#/components/ui/braille-loader'
import { useWindowKeydown } from '#/hooks/use-window-keydown'
import { useState } from 'react'
import { IssueCreateDialog } from './issue-create-dialog'
import { IssueDetailPage } from './issue-detail-page'
import { IssueList } from './issue-list'
import type { IssueStatus } from './types'
import { useIssues } from './use-issues'

export function IssuesPage({
  createOpen,
  createStatus,
  onCreateOpenChange,
}: {
  createOpen: boolean
  createStatus?: IssueStatus
  onCreateOpenChange: (open: boolean, status?: IssueStatus) => void
}) {
  const { data: issues = [], isPending, isError, error } = useIssues()
  const [selectedIssueId, setSelectedIssueId] = useState<string>()
  const [createParentId, setCreateParentId] = useState<string>()

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
    <div className="flex min-h-0 flex-1 flex-col">
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
          <IssueList
            issues={issues}
            onOpenIssue={setSelectedIssueId}
            onCreateInStatus={(status) => openCreate(status)}
          />
        )}
      </div>
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
