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
import { Check, CircleDashed, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { cn } from '#/lib/utils'
import { formatIssueId } from './format'
import { IssuePriorityIcon, IssueStatusIcon } from './issue-icons'
import type { Issue, IssueOwner, IssuePriority, IssueStatus } from './types'
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABEL,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUSES,
} from './types'
import { useAssignIssue, useUpdateIssue } from './use-issues'
import { useWorkspaceMembers } from './use-workspace-members'

const iconTriggerClass =
  'inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40'

const railTriggerClass =
  'inline-flex h-8 max-w-full items-center gap-2 rounded-sm px-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40'

function ownerValue(owner: IssueOwner | undefined): string {
  if (!owner) return 'none'
  return `${owner.kind}:${owner.id}`
}

function parseOwnerValue(value: string): IssueOwner | null {
  if (value === 'none') return null
  const separator = value.indexOf(':')
  if (separator <= 0) return null
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (!id) return null
  if (kind === 'account' || kind === 'agent') return { kind, id }
  return null
}

export function OwnerDisplay({
  owner,
  className,
}: {
  owner?: IssueOwner
  className?: string
}) {
  const { data: agents = [] } = useAgentDefinitions()
  const { data: members = [] } = useWorkspaceMembers()
  if (!owner) {
    return (
      <span
        className={cn(
          'flex items-center gap-1.5 text-muted-foreground',
          className,
        )}
      >
        <span className="relative inline-flex size-5 items-center justify-center">
          <CircleDashed className="size-5" />
          <UserRound className="absolute size-2.5" />
        </span>
        <span className="truncate">No assignee</span>
      </span>
    )
  }

  if (owner.kind === 'agent') {
    const name = agentNameFrom(agents, owner.id)
    return (
      <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
        <Avatar size="sm" className="size-5 shrink-0" title={name}>
          <AvatarFallback className="border bg-muted text-primary">
            <AgentAnt className="size-3.5" />
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate">{name}</span>
      </span>
    )
  }

  const member = members.find((user) => user.id === owner.id)
  const name = member?.displayName || member?.name || owner.id
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <Avatar size="sm" className="size-5 shrink-0" title={name}>
        {member?.image && <AvatarImage src={member.image} alt="" />}
        <AvatarFallback className="bg-orange-600 text-[9px] text-white">
          {initials || '?'}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}

export function PriorityPicker({
  issue,
  variant = 'icon',
}: {
  issue: Issue
  variant?: 'icon' | 'rail'
}) {
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
            className={variant === 'rail' ? railTriggerClass : iconTriggerClass}
            aria-label={`Priority: ${ISSUE_PRIORITY_LABEL[issue.priority]}`}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <IssuePriorityIcon priority={issue.priority} />
        {variant === 'rail' && (
          <span className="truncate">{ISSUE_PRIORITY_LABEL[issue.priority]}</span>
        )}
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

export function StatusPicker({
  issue,
  variant = 'icon',
}: {
  issue: Issue
  variant?: 'icon' | 'rail'
}) {
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
            className={variant === 'rail' ? railTriggerClass : iconTriggerClass}
            aria-label={`Status: ${ISSUE_STATUS_LABEL[issue.status]}`}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <IssueStatusIcon status={issue.status} />
        {variant === 'rail' && (
          <span className="truncate">{ISSUE_STATUS_LABEL[issue.status]}</span>
        )}
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

export function OwnerPicker({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false)
  const assignIssue = useAssignIssue()
  const { data: agents = [] } = useAgentDefinitions()
  const { data: members = [] } = useWorkspaceMembers()

  const select = async (value: string) => {
    const owner = parseOwnerValue(value)
    const current = ownerValue(issue.owner)
    if (value === current) {
      setOpen(false)
      return
    }
    try {
      await assignIssue.mutateAsync({ id: issue.id, owner })
      setOpen(false)
      toast.add({
        type: 'success',
        title: `Assignee updated on ${formatIssueId(issue.number)}`,
      })
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not update assignee',
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
            className={cn(railTriggerClass, 'w-full justify-start')}
            aria-label="Assignee"
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <OwnerDisplay owner={issue.owner} className="text-sm" />
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-56 p-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
          onClick={() => void select('none')}
          disabled={assignIssue.isPending}
        >
          <OwnerDisplay className="text-sm" />
          {!issue.owner && <Check className="ml-auto size-3.5 text-muted-foreground" />}
        </button>
        {members.map((member) => {
          const value = ownerValue({ kind: 'account', id: member.id })
          return (
            <button
              key={value}
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => void select(value)}
              disabled={assignIssue.isPending}
            >
              <OwnerDisplay
                owner={{ kind: 'account', id: member.id }}
                className="min-w-0 flex-1 text-sm"
              />
              {issue.owner?.kind === 'account' &&
                issue.owner.id === member.id && (
                  <Check className="size-3.5 shrink-0 text-muted-foreground" />
                )}
            </button>
          )
        })}
        {agents.map((agent) => {
          const value = ownerValue({ kind: 'agent', id: agent.id })
          return (
            <button
              key={value}
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => void select(value)}
              disabled={assignIssue.isPending}
            >
              <OwnerDisplay
                owner={{ kind: 'agent', id: agent.id }}
                className="min-w-0 flex-1 text-sm"
              />
              {issue.owner?.kind === 'agent' && issue.owner.id === agent.id && (
                <Check className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

export function TagsEditor({ issue }: { issue: Issue }) {
  const [draft, setDraft] = useState('')
  const updateIssue = useUpdateIssue()

  const addTag = async (event?: FormEvent) => {
    event?.preventDefault()
    const tag = draft.trim()
    if (!tag) return
    if (issue.tags.includes(tag)) {
      setDraft('')
      return
    }
    try {
      await updateIssue.mutateAsync({
        id: issue.id,
        tags: [...issue.tags, tag],
      })
      setDraft('')
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not add label',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  const removeTag = async (tag: string) => {
    try {
      await updateIssue.mutateAsync({
        id: issue.id,
        tags: issue.tags.filter((current) => current !== tag),
      })
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not remove label',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {issue.tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-xs text-muted-foreground"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-sky-400" />
          <span className="truncate">{tag}</span>
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-muted hover:text-foreground"
            aria-label={`Remove ${tag}`}
            onClick={() => void removeTag(tag)}
            disabled={updateIssue.isPending}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <form onSubmit={(event) => void addTag(event)} className="inline-flex">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add label"
          className="h-7 w-24 rounded-sm border-0 bg-transparent px-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          disabled={updateIssue.isPending}
        />
      </form>
    </div>
  )
}

export function TimeSpentEditor({ issue }: { issue: Issue }) {
  const updateIssue = useUpdateIssue()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const total = issue.timeSpent.reduce((sum, minutes) => sum + minutes, 0)

  const beginEdit = () => {
    setDraft(total > 0 ? String(total) : '')
    setEditing(true)
  }

  const save = async () => {
    const trimmed = draft.trim()
    const minutes = Number(trimmed)
    const next =
      trimmed === '' || !Number.isFinite(minutes) || minutes <= 0
        ? []
        : [Math.round(minutes)]
    const same =
      next.length === issue.timeSpent.length &&
      next.every((value, index) => value === issue.timeSpent[index])
    if (same) {
      setEditing(false)
      return
    }
    try {
      await updateIssue.mutateAsync({ id: issue.id, timeSpent: next })
      setEditing(false)
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not update time spent',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void save()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        type="number"
        min={0}
        step={1}
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={onKeyDown}
        className="h-8 w-24 rounded-sm border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label="Time spent in minutes"
        disabled={updateIssue.isPending}
      />
    )
  }

  return (
    <button
      type="button"
      className={railTriggerClass}
      onClick={beginEdit}
      aria-label="Edit time spent"
    >
      {total > 0 ? `${total}m` : '—'}
    </button>
  )
}
