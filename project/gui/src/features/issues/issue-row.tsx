import { useState } from 'react'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { toast } from '#/components/ui/toast'
import { cn } from '#/lib/utils'
import {
  Check,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Clock3,
  Minus,
  SignalHigh,
  SignalLow,
  SignalMedium,
  TriangleAlert,
} from 'lucide-react'
import type { Issue, IssuePriority, IssueStatus } from './types'
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABEL,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUSES,
} from './types'
import { formatIssueCreatedAt, formatIssueId } from './format'
import { useUpdateIssue } from './use-issues'

const priorityIcon: Record<
  IssuePriority,
  { icon: typeof Minus; className?: string }
> = {
  none: { icon: Minus, className: 'text-muted-foreground/70' },
  low: { icon: SignalLow, className: 'text-muted-foreground' },
  medium: { icon: SignalMedium, className: 'text-muted-foreground' },
  high: { icon: SignalHigh, className: 'text-orange-500' },
  urgent: { icon: TriangleAlert, className: 'text-red-500' },
}

const statusIcon: Record<
  IssueStatus,
  { icon: typeof Circle; className: string }
> = {
  backlog: { icon: CircleDashed, className: 'text-muted-foreground' },
  todo: { icon: Circle, className: 'text-muted-foreground' },
  in_progress: { icon: CircleDot, className: 'text-yellow-500' },
  in_review: { icon: Clock3, className: 'text-emerald-500' },
  done: { icon: CircleCheck, className: 'text-indigo-500' },
}

export function IssueStatusIcon({
  status,
  className,
}: {
  status: IssueStatus
  className?: string
}) {
  const { icon: Icon, className: color } = statusIcon[status]
  return <Icon className={cn('size-3.5 shrink-0', color, className)} />
}

function PriorityIcon({
  priority,
  className,
}: {
  priority: IssuePriority
  className?: string
}) {
  const { icon: Icon, className: color } = priorityIcon[priority]
  return <Icon className={cn('size-3.5 shrink-0', color, className)} />
}

function ownerInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2)
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  return label.slice(0, 2).toUpperCase() || '?'
}

function OwnerAvatar({ issue }: { issue: Issue }) {
  const { data: agents = [] } = useAgentDefinitions()
  if (!issue.owner) return <span className="size-5 shrink-0" />
  const label =
    issue.owner.kind === 'agent'
      ? agentNameFrom(agents, issue.owner.id)
      : issue.owner.id
  return (
    <Avatar className="size-5 shrink-0">
      <AvatarFallback className="bg-orange-600 text-[9px] text-white">
        {ownerInitials(label)}
      </AvatarFallback>
    </Avatar>
  )
}

const iconTriggerClass =
  'inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40'

function PriorityPicker({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false)
  const updateIssue = useUpdateIssue()

  const select = async (priority: IssuePriority) => {
    if (priority === issue.priority) {
      setOpen(false)
      return
    }
    try {
      await updateIssue.mutateAsync({ id: issue.id, priority })
      setOpen(false)
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
        <PriorityIcon priority={issue.priority} />
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
            <PriorityIcon priority={priority} />
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
    try {
      await updateIssue.mutateAsync({ id: issue.id, status })
      setOpen(false)
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

export function IssueRow({ issue }: { issue: Issue }) {
  return (
    <div className="group flex h-9 items-center gap-2 border-b border-border/40 px-3 text-sm last:border-b-0 hover:bg-muted/40">
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
        {issue.childProgress && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">
            <Circle className="size-3" />
            {issue.childProgress.done}/{issue.childProgress.total}
          </span>
        )}
      </div>
      <OwnerAvatar issue={issue} />
      <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
        {formatIssueCreatedAt(issue.createdAt)}
      </span>
    </div>
  )
}
