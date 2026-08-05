import { useState } from 'react'
import { Plus } from 'lucide-react'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import { IssueCreateDialog } from './issue-create-dialog'
import { IssueList } from './issue-list'
import type { IssueStatus } from './types'
import { useIssues } from './use-issues'

export function IssuesPage() {
  const { data: issues = [], isPending, isError, error } = useIssues()
  const [createOpen, setCreateOpen] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<IssueStatus>()

  const openCreate = (status?: IssueStatus) => {
    setDefaultStatus(status)
    setCreateOpen(true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-end border-b px-4 py-2">
        <Button type="button" size="sm" onClick={() => openCreate()}>
          <Plus data-icon="inline-start" />
          New issue
        </Button>
      </div>
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
          <IssueList issues={issues} onCreateInStatus={openCreate} />
        )}
      </div>
      <IssueCreateDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setDefaultStatus(undefined)
        }}
        defaultStatus={defaultStatus}
      />
    </div>
  )
}
