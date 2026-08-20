import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { Separator } from '#/components/ui/separator'
import { toast } from '#/components/ui/toast'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import {
  Check,
  ChevronDown,
  CircleDashed,
  Flag,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { IssuePriorityIcon, IssueStatusIcon } from './issue-icons'
import { OwnerDisplay } from './owner-display'
import type { Issue, IssueOwner, IssuePriority, IssueStatus } from './types'
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABEL,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUSES,
} from './types'
import { useAssignIssue, useDeleteIssue, useUpdateIssue } from './use-issues'
import { useWorkspaceMembers } from './use-workspace-members'

function BulkPicker<T>({
  label,
  icon,
  options,
  disabled,
  onSelect,
}: {
  label: string
  icon: ReactNode
  options: { key: string; value: T; content: ReactNode }[]
  disabled: boolean
  onSelect: (value: T) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="sm" disabled={disabled} />
        }
      >
        {icon}
        {label}
        <ChevronDown className="size-3" />
      </PopoverTrigger>
      <PopoverContent align="center" side="top" className="w-56 p-1">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => {
              setOpen(false)
              onSelect(option.value)
            }}
          >
            {option.content}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export function IssueBulkActions({
  issues,
  onSelectionChange,
}: {
  issues: Issue[]
  onSelectionChange: (ids: string[]) => void
}) {
  const [pending, setPending] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const updateIssue = useUpdateIssue()
  const assignIssue = useAssignIssue()
  const deleteIssue = useDeleteIssue()
  const { data: agents = [] } = useAgentDefinitions()
  const { data: members = [] } = useWorkspaceMembers()
  const hasSelection = issues.length > 0

  const apply = async (
    successTitle: (count: number) => string,
    action: (issue: Issue) => Promise<unknown>,
    failureAction = 'updated',
  ) => {
    setPending(true)
    const results = await Promise.allSettled(issues.map(action))
    const failed = issues.filter(
      (_, index) => results[index]?.status === 'rejected',
    )
    setPending(false)
    onSelectionChange(failed.map((issue) => issue.id))

    if (failed.length === 0) {
      toast.add({ type: 'success', title: successTitle(issues.length) })
      return
    }

    toast.add({
      type: 'error',
      title: `${failed.length} of ${issues.length} issues could not be ${failureAction}`,
      description: 'The failed issues remain selected so you can retry.',
    })
  }

  const update = (
    patch: { status: IssueStatus } | { priority: IssuePriority },
  ) =>
    void apply(
      (count) => `${count} ${count === 1 ? 'issue' : 'issues'} updated`,
      (issue) => updateIssue.mutateAsync({ id: issue.id, ...patch }),
    )

  const assign = (owner: IssueOwner | null) =>
    void apply(
      (count) => `${count} ${count === 1 ? 'issue' : 'issues'} assigned`,
      (issue) => assignIssue.mutateAsync({ id: issue.id, owner }),
      'assigned',
    )

  const ownerOptions: {
    key: string
    value: IssueOwner | null
    content: ReactNode
  }[] = [
    {
      key: 'none',
      value: null,
      content: (
        <>
          <span className="relative inline-flex size-5 items-center justify-center text-muted-foreground">
            <CircleDashed className="size-5" />
            <UserRound className="absolute size-2.5" />
          </span>
          No assignee
        </>
      ),
    },
    ...members.map((member) => ({
      key: `account:${member.id}`,
      value: { kind: 'account' as const, id: member.id },
      content: (
        <OwnerDisplay
          owner={{ kind: 'account', id: member.id }}
          className="min-w-0 flex-1"
        />
      ),
    })),
    ...agents.map((agent) => ({
      key: `agent:${agent.id}`,
      value: { kind: 'agent' as const, id: agent.id },
      content: (
        <OwnerDisplay
          owner={{ kind: 'agent', id: agent.id }}
          className="min-w-0 flex-1"
        />
      ),
    })),
  ]

  return (
    <>
      <div
        aria-hidden={!hasSelection}
        className={`absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-md border bg-popover p-1.5 text-popover-foreground shadow-lg transition-[translate,opacity] motion-reduce:transition-none ${
          hasSelection
            ? 'translate-y-0 opacity-100 duration-200 ease-out'
            : 'pointer-events-none translate-y-[calc(100%+1rem)] opacity-0 duration-150 ease-in'
        }`}
      >
        <span className="px-2 text-sm font-medium tabular-nums">
          {issues.length} selected
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear selection"
          disabled={pending || !hasSelection}
          onClick={() => onSelectionChange([])}
        >
          <X />
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <BulkPicker
          label="Assign"
          icon={<UserRound />}
          options={ownerOptions}
          disabled={pending || !hasSelection}
          onSelect={assign}
        />
        <BulkPicker
          label="Priority"
          icon={<Flag />}
          options={ISSUE_PRIORITIES.map((priority) => ({
            key: priority,
            value: priority,
            content: (
              <>
                <IssuePriorityIcon priority={priority} />
                <span className="flex-1">{ISSUE_PRIORITY_LABEL[priority]}</span>
              </>
            ),
          }))}
          disabled={pending || !hasSelection}
          onSelect={(priority) => update({ priority })}
        />
        <BulkPicker
          label="Status"
          icon={<Check />}
          options={ISSUE_STATUSES.map((status) => ({
            key: status,
            value: status,
            content: (
              <>
                <IssueStatusIcon status={status} />
                <span className="flex-1">{ISSUE_STATUS_LABEL[status]}</span>
              </>
            ),
          }))}
          disabled={pending || !hasSelection}
          onSelect={(status) => update({ status })}
        />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          aria-label="Delete selected issues"
          disabled={pending || !hasSelection}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 />
        </Button>
      </div>

      <AlertDialog
        open={hasSelection && deleteOpen}
        onOpenChange={setDeleteOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {issues.length} selected issues?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the selected issues. Their unselected
              sub-issues are kept as top-level issues.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setDeleteOpen(false)
                void apply(
                  (count) =>
                    `${count} ${count === 1 ? 'issue' : 'issues'} deleted`,
                  (issue) => deleteIssue.mutateAsync(issue.id),
                  'deleted',
                )
              }}
            >
              Delete issues
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
