import { AgentAnt } from '#/components/avatar'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { toast } from '#/components/ui/toast'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { Check, Circle, CornerDownRight } from 'lucide-react'
import { useState } from 'react'
import { formatIssueCreatedAt, formatIssueId } from './format'
import { IssuePriorityIcon, IssueStatusIcon } from './issue-icons'
import type { Issue, IssuePriority, IssueStatus } from './types'
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABEL,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUSES,
} from './types'
import { useIssues, useUpdateIssue } from './use-issues'
import { useWorkspaceMembers } from './use-workspace-members'

const iconTriggerClass =
  'inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40'

function OwnerCell({ issue }: { issue: Issue }) {
  const { data: agents = [] } = useAgentDefinitions()
  const { data: members = [] } = useWorkspaceMembers()
  if (!issue.owner) return <span className="w-28 shrink-0" />

  if (issue.owner.kind === 'agent') {
    const name = agentNameFrom(agents, issue.owner.id)
    return (
      <span className="flex w-28 shrink-0 items-center gap-1.5">
        <Avatar size="sm" className="size-5 shrink-0" title={name}>
          <AvatarFallback className="bg-muted text-primary border">
            <AgentAnt className="size-3.5" />
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate text-xs">{name}</span>
      </span>
    )
  }

  const member = members.find((user) => user.id === issue.owner!.id)
  const name = member?.displayName || member?.name || issue.owner.id
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <span className="flex w-28 shrink-0 items-center gap-1.5">
      <Avatar size="sm" className="size-5 shrink-0" title={name}>
        {member?.image && <AvatarImage src={member.image} alt="" />}
        <AvatarFallback className="bg-orange-600 text-[9px] text-white">
          {initials || '?'}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate text-xs">{name}</span>
    </span>
  )
}

function PriorityPicker({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false)
  const updateIssue = useUpdateIssue()

  const select = async (priority: IssuePriority) => {
    if (priority === issue.priority) {
      setOpen(false)
      return
    }
    const previous = ISSUE_PRIORITY_LABEL[issue.priority]
    try {
      await updateIssue.mutateAsync({ id: issue.id, priority })
      setOpen(false)
      toast.add({
        type: 'success',
        title: `Priority updated on ${formatIssueId(issue.number)}`,
        description: `${previous} → ${ISSUE_PRIORITY_LABEL[priority]}`,
      })
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not update priority',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={iconTriggerClass}
            aria-label={`Priority: ${ISSUE_PRIORITY_LABEL[issue.priority]}`}
          />
        }
      >
        <IssuePriorityIcon priority={issue.priority} />
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-44 p-1">
        {ISSUE_PRIORITIES.map((priority) => (
          <button
            key={priority}
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => void select(priority)}
            disabled={updateIssue.isPending}
          >
            <IssuePriorityIcon priority={priority} />
            <span className="flex-1">{ISSUE_PRIORITY_LABEL[priority]}</span>
            {priority === issue.priority && (
              <Check className="size-3.5 text-muted-foreground" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function StatusPicker({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false)
  const updateIssue = useUpdateIssue()

  const select = async (status: IssueStatus) => {
    if (status === issue.status) {
      setOpen(false)
      return
    }
    const previous = ISSUE_STATUS_LABEL[issue.status]
    try {
      await updateIssue.mutateAsync({ id: issue.id, status })
      setOpen(false)
      toast.add({
        type: 'success',
        title: `Status updated on ${formatIssueId(issue.number)}`,
        description: `${previous} → ${ISSUE_STATUS_LABEL[status]}`,
      })
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not update status',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={iconTriggerClass}
            aria-label={`Status: ${ISSUE_STATUS_LABEL[issue.status]}`}
          />
        }
      >
        <IssueStatusIcon status={issue.status} />
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-44 p-1">
        {ISSUE_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => void select(status)}
            disabled={updateIssue.isPending}
          >
            <IssueStatusIcon status={status} />
            <span className="flex-1">{ISSUE_STATUS_LABEL[status]}</span>
            {status === issue.status && (
              <Check className="size-3.5 text-muted-foreground" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function ChildProgressChip({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false)
  const { data: issues = [] } = useIssues()
  const progress = issue.childProgress
  if (!progress) return null

  const children = issues
    .filter((child) => child.parentId === issue.id)
    .sort((a, b) => a.number - b.number)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border/70 px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label={`${progress.done} of ${progress.total} sub-issues done`}
          />
        }
      >
        <Circle className="size-3.5" />
        {progress.done}/{progress.total}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex items-center gap-2 justify-between">
          <p className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">
            Sub-issues
          </p>
          <p className="px-2 pb-1.5 text-xs text-muted-foreground">
            {progress.done} of {progress.total} done
          </p>
        </div>
        <ul className="max-h-64 space-y-0.5 overflow-y-auto">
          {children.map((child) => (
            <li
              key={child.id}
              className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
            >
              <IssueStatusIcon status={child.status} />
              <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                {formatIssueId(child.number)}
              </span>
              <span className="min-w-0 flex-1 truncate">{child.title}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export function IssueRow({
  issue,
  depth = 0,
}: {
  issue: Issue
  depth?: number
}) {
  return (
    <div
      className="group flex h-9 items-center gap-2 border-b border-border/40 px-3 text-sm last:border-b-0 hover:bg-muted/40"
      style={depth > 0 ? { paddingLeft: 12 + depth * 16 } : undefined}
    >
      {depth > 0 ? (
        <CornerDownRight
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      ) : null}
      <PriorityPicker issue={issue} />
      <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
        {formatIssueId(issue.number)}
      </span>
      <StatusPicker issue={issue} />
      <span className="min-w-0 flex-1 truncate font-medium">{issue.title}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        {issue.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex max-w-28 items-center gap-1 truncate rounded-full border border-border/70 px-1.5 py-0.5 text-[11px] text-muted-foreground"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-sky-400" />
            {tag}
          </span>
        ))}
        <ChildProgressChip issue={issue} />
      </div>
      <OwnerCell issue={issue} />
      <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
        {formatIssueCreatedAt(issue.createdAt)}
      </span>
    </div>
  )
}
