import { Button } from '#/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import { useStoredBoolean } from '#/hooks/use-stored-boolean'
import { cn } from '#/lib/utils'
import { ChevronDown, Plus } from 'lucide-react'
import { IssueRow } from './issue-row'
import { IssueStatusIcon } from './issue-icons'
import { nestIssuesByParent } from './issue-tree'
import type { IssueTreeNode } from './issue-tree'
import type { Issue, IssueStatus } from './types'
import { ISSUE_STATUS_LABEL, ISSUE_STATUSES } from './types'

function StatusGroup({
  status,
  rows,
  onOpenIssue,
  onCreateInStatus,
  selectedIssueIds,
  onIssueSelectedChange,
}: {
  status: IssueStatus
  rows: IssueTreeNode[]
  onOpenIssue?: (issueId: string) => void
  onCreateInStatus?: (status: IssueStatus) => void
  selectedIssueIds: ReadonlySet<string>
  onIssueSelectedChange?: (
    issueId: string,
    selected: boolean,
    extendSelection: boolean,
  ) => void
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
          <span className="text-muted-foreground">{rows.length}</span>
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
          {rows.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No issues</p>
          ) : (
            rows.map(({ issue, depth }) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                depth={depth}
                onOpen={onOpenIssue}
                selected={selectedIssueIds.has(issue.id)}
                onSelectedChange={(selected, extendSelection) =>
                  onIssueSelectedChange?.(issue.id, selected, extendSelection)
                }
              />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function IssueList({
  issues,
  onOpenIssue,
  onCreateInStatus,
  visibleStatuses,
  hideEmptyGroups = false,
  selectedIssueIds = new Set(),
  onIssueSelectedChange,
}: {
  issues: Issue[]
  onOpenIssue?: (issueId: string) => void
  onCreateInStatus?: (status: IssueStatus) => void
  /** Status groups to render; defaults to all statuses. */
  visibleStatuses?: readonly IssueStatus[]
  /** When true, skip status groups with no matching issues. */
  hideEmptyGroups?: boolean
  selectedIssueIds?: ReadonlySet<string>
  onIssueSelectedChange?: (
    issueId: string,
    selected: boolean,
    extendSelection: boolean,
  ) => void
}) {
  const statuses = visibleStatuses ?? ISSUE_STATUSES

  return (
    <div>
      {statuses.map((status) => {
        const inStatus = issues.filter((issue) => issue.status === status)
        if (hideEmptyGroups && inStatus.length === 0) return null
        return (
          <StatusGroup
            key={status}
            status={status}
            rows={nestIssuesByParent(inStatus)}
            onOpenIssue={onOpenIssue}
            onCreateInStatus={onCreateInStatus}
            selectedIssueIds={selectedIssueIds}
            onIssueSelectedChange={onIssueSelectedChange}
          />
        )
      })}
    </div>
  )
}
