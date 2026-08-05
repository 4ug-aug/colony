import { Button } from '#/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import { useStoredBoolean } from '#/hooks/use-stored-boolean'
import { cn } from '#/lib/utils'
import { ChevronDown, Plus } from 'lucide-react'
import { IssueRow, IssueStatusIcon } from './issue-row'
import type { Issue, IssueStatus } from './types'
import { ISSUE_STATUS_LABEL, ISSUE_STATUSES } from './types'

function StatusGroup({
  status,
  issues,
  onCreateInStatus,
}: {
  status: IssueStatus
  issues: Issue[]
  onCreateInStatus?: (status: IssueStatus) => void
}) {
  const [open, setOpen] = useStoredBoolean(`issues.group.${status}`, true)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-3">
      <div className="flex h-8 items-center gap-1.5 rounded-t-md bg-muted/60 px-2">
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left text-sm font-medium outline-none hover:text-foreground"
            />
          }
        >
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              !open && '-rotate-90',
            )}
          />
          <IssueStatusIcon status={status} />
          <span>{ISSUE_STATUS_LABEL[status]}</span>
          <span className="text-muted-foreground">{issues.length}</span>
        </CollapsibleTrigger>
        {onCreateInStatus && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-6 text-muted-foreground"
            aria-label={`New issue in ${ISSUE_STATUS_LABEL[status]}`}
            onClick={() => onCreateInStatus(status)}
          >
            <Plus className="size-3.5" />
          </Button>
        )}
      </div>
      <CollapsibleContent>
        <div className="overflow-hidden rounded-b-md border border-t-0 border-border/50 bg-background">
          {issues.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No issues</p>
          ) : (
            issues.map((issue) => <IssueRow key={issue.id} issue={issue} />)
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function IssueList({
  issues,
  onCreateInStatus,
}: {
  issues: Issue[]
  onCreateInStatus?: (status: IssueStatus) => void
}) {
  return (
    <div>
      {ISSUE_STATUSES.map((status) => (
        <StatusGroup
          key={status}
          status={status}
          issues={issues.filter((issue) => issue.status === status)}
          onCreateInStatus={onCreateInStatus}
        />
      ))}
    </div>
  )
}
