import { AccountFace, AgentAnt } from '#/components/avatar'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '#/components/ui/command'
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
import { cn } from '#/lib/utils'
import { Check, CircleDashed, Plus, UserRound } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useState } from 'react'
import { formatIssueId, formatTimeSpentMinutes } from './format'
import { IssuePriorityIcon, IssueStatusIcon } from './issue-icons'
import { IssueLabelChip, LabelDot } from './issue-labels'
import type {
  Issue,
  IssueActor,
  IssueOwner,
  IssuePriority,
  IssueStatus,
} from './types'
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABEL,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUSES,
} from './types'
import { useAssignIssue, useIssues, useUpdateIssue } from './use-issues'
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
  owner?: IssueActor
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
        <span className="truncate" data-owner-name>
          No assignee
        </span>
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
        <span className="min-w-0 truncate text-sm" data-owner-name>
          {name}
        </span>
      </span>
    )
  }

  const member = members.find((user) => user.id === owner.id)
  const name = member?.displayName || member?.name || owner.id

  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <AccountFace
        name={member?.name || owner.id}
        image={member?.image}
        color={member?.color}
        className="size-5 text-[9px]"
      />
      <span className="min-w-0 truncate text-sm" data-owner-name>
        {name}
      </span>
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
  return (
    <PropertyPicker
      issue={issue}
      variant={variant}
      current={issue.priority}
      options={ISSUE_PRIORITIES}
      labelOf={(priority) => ISSUE_PRIORITY_LABEL[priority]}
      ariaName="Priority"
      iconOf={(priority) => <IssuePriorityIcon priority={priority} />}
      countOf={(candidate, priority) => candidate.priority === priority}
      onSelect={(priority) => ({ id: issue.id, priority })}
    />
  )
}

export function StatusPicker({
  issue,
  variant = 'icon',
}: {
  issue: Issue
  variant?: 'icon' | 'rail'
}) {
  return (
    <PropertyPicker
      issue={issue}
      variant={variant}
      current={issue.status}
      options={ISSUE_STATUSES}
      labelOf={(status) => ISSUE_STATUS_LABEL[status]}
      ariaName="Status"
      iconOf={(status) => <IssueStatusIcon status={status} />}
      countOf={(candidate, status) => candidate.status === status}
      onSelect={(status) => ({ id: issue.id, status })}
    />
  )
}

function PropertyPicker<T extends string>({
  issue,
  variant,
  current,
  options,
  labelOf,
  ariaName,
  iconOf,
  countOf,
  onSelect,
}: {
  issue: Issue
  variant: 'icon' | 'rail'
  current: T
  options: readonly T[]
  labelOf: (value: T) => string
  ariaName: string
  iconOf: (value: T) => ReactNode
  countOf: (issue: Issue, value: T) => boolean
  onSelect: (value: T) => {
    id: string
    status?: IssueStatus
    priority?: IssuePriority
  }
}) {
  const [open, setOpen] = useState(false)
  const updateIssue = useUpdateIssue()
  const { data: issues = [] } = useIssues()

  const select = async (value: T) => {
    if (value === current) {
      setOpen(false)
      return
    }
    const previous = labelOf(current)
    try {
      await updateIssue.mutateAsync(onSelect(value))
      setOpen(false)
      toast.add({
        type: 'success',
        title: `${ariaName} updated on ${formatIssueId(issue.number)}`,
        description: `${previous} → ${labelOf(value)}`,
      })
    } catch (reason) {
      toast.add({
        type: 'error',
        title: `Could not update ${ariaName.toLowerCase()}`,
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
            aria-label={`${ariaName}: ${labelOf(current)}`}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        {iconOf(current)}
        {variant === 'rail' && (
          <span className="truncate">{labelOf(current)}</span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-60 p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <Command shouldFilter>
          <CommandInput placeholder={`Set ${ariaName.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No {ariaName.toLowerCase()} found.</CommandEmpty>
            <CommandGroup>
              {options.map((value) => (
                <CommandItem
                  key={value}
                  value={labelOf(value)}
                  className="text-sm [&>svg:last-child]:hidden"
                  onSelect={() => void select(value)}
                  disabled={updateIssue.isPending}
                >
                  {iconOf(value)}
                  <span className="flex-1">{labelOf(value)}</span>
                  <span className="flex size-4 items-center justify-center">
                    {value === current && (
                      <Check className="size-3.5 text-muted-foreground" />
                    )}
                  </span>
                  <span className="w-6 text-right tabular-nums text-muted-foreground">
                    {
                      issues.filter((candidate) => countOf(candidate, value))
                        .length
                    }
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function OwnerPicker({
  issue,
  variant = 'rail',
}: {
  issue: Issue
  variant?: 'list' | 'rail'
}) {
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
      const { run } = await assignIssue.mutateAsync({ id: issue.id, owner })
      setOpen(false)
      toast.add({
        type: 'success',
        title: run
          ? `Assigned and started run on ${formatIssueId(issue.number)}`
          : `Assignee updated on ${formatIssueId(issue.number)}`,
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
            className={
              variant === 'list'
                ? 'inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 @xl:w-28 @xl:justify-start @xl:px-1 @max-xl:[&_[data-owner-name]]:hidden'
                : cn(railTriggerClass, 'w-full justify-start')
            }
            aria-label="Assignee"
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <OwnerDisplay
          owner={issue.owner}
          className={variant === 'list' ? 'w-full text-xs' : 'text-sm'}
        />
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-56 p-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
          onClick={() => void select('none')}
          disabled={assignIssue.isPending}
        >
          <OwnerDisplay className="text-sm" />
          {!issue.owner && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
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

function LabelCheck({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-sm border',
        checked
          ? 'border-sky-500 bg-sky-500 text-white'
          : 'border-muted-foreground/50 bg-transparent',
      )}
      aria-hidden
    >
      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  )
}

export function TagsEditor({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const updateIssue = useUpdateIssue()
  const { data: issues = [] } = useIssues()

  const knownTags = [
    ...new Set(issues.flatMap((candidate) => candidate.tags)),
  ].sort((a, b) => a.localeCompare(b))

  const selected = new Set(issue.tags)
  const selectedTags = issue.tags
  const availableTags = knownTags.filter((tag) => !selected.has(tag))
  const trimmed = query.trim()
  const canCreate =
    trimmed.length > 0 &&
    !knownTags.some((tag) => tag.toLowerCase() === trimmed.toLowerCase())

  const setTags = async (tags: string[]) => {
    try {
      await updateIssue.mutateAsync({ id: issue.id, tags })
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not update labels',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  const toggle = (tag: string) => {
    void setTags(
      selected.has(tag)
        ? issue.tags.filter((current) => current !== tag)
        : [...issue.tags, tag],
    )
  }

  const create = () => {
    if (!canCreate) return
    void setTags([...issue.tags, trimmed])
    setQuery('')
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Labels</h3>
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) setQuery('')
          }}
        >
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground"
                aria-label="Change or add labels"
              />
            }
          >
            <Plus className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            <Command shouldFilter>
              <CommandInput
                placeholder="Change or add labels…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                <CommandEmpty>
                  {canCreate ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={create}
                      disabled={updateIssue.isPending}
                    >
                      Create “{trimmed}”
                    </button>
                  ) : (
                    'No labels found.'
                  )}
                </CommandEmpty>
                {selectedTags.length > 0 && (
                  <CommandGroup>
                    {selectedTags.map((tag) => (
                      <CommandItem
                        key={`selected:${tag}`}
                        value={tag}
                        onSelect={() => toggle(tag)}
                        disabled={updateIssue.isPending}
                      >
                        <LabelCheck checked />
                        <LabelDot tag={tag} />
                        <span className="min-w-0 flex-1 truncate">{tag}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {selectedTags.length > 0 &&
                  (availableTags.length > 0 || canCreate) && (
                    <CommandSeparator />
                  )}
                {(availableTags.length > 0 || canCreate) && (
                  <CommandGroup>
                    {availableTags.map((tag) => (
                      <CommandItem
                        key={tag}
                        value={tag}
                        onSelect={() => toggle(tag)}
                        disabled={updateIssue.isPending}
                      >
                        <LabelCheck checked={false} />
                        <LabelDot tag={tag} />
                        <span className="min-w-0 flex-1 truncate">{tag}</span>
                      </CommandItem>
                    ))}
                    {canCreate && (
                      <CommandItem
                        value={`create-${trimmed}`}
                        onSelect={create}
                        disabled={updateIssue.isPending}
                      >
                        <LabelCheck checked={false} />
                        <LabelDot tag={trimmed} />
                        <span className="min-w-0 flex-1 truncate">
                          Create “{trimmed}”
                        </span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedTags.map((tag) => (
            <IssueLabelChip key={tag} tag={tag} className="max-w-full" />
          ))}
        </div>
      )}
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
      {total > 0 ? formatTimeSpentMinutes(total) : '—'}
    </button>
  )
}
