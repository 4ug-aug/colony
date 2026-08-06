import { AgentAnt, Avatar } from '#/components/avatar'
import { Button } from '#/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import { toast } from '#/components/ui/toast'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import type { Author } from '#/features/rooms/types'
import { cn } from '#/lib/utils'
import { ChevronDown, CircleDashed, UserRound } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { useState } from 'react'
import { formatIssueId } from './format'
import { IssuePriorityIcon, IssueStatusIcon } from './issue-icons'
import type { Issue, IssueOwner, IssuePriority, IssueStatus } from './types'
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABEL,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUSES,
} from './types'
import { useCreateIssue, useIssues } from './use-issues'
import { useWorkspaceMembers } from './use-workspace-members'

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-xs font-medium text-muted-foreground"
    >
      {children}
    </label>
  )
}

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function ownerValue(owner: IssueOwner | undefined): string {
  if (!owner) return 'none'
  return `${owner.kind}:${owner.id}`
}

function parseOwnerValue(value: string | null): IssueOwner | undefined {
  if (!value || value === 'none') return undefined
  const separator = value.indexOf(':')
  if (separator <= 0) return undefined
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (!id) return undefined
  if (kind === 'account' || kind === 'agent') return { kind, id }
  return undefined
}

function CompactPersonAvatar({ author }: { author: Author }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 [&_.mt-0\\.5]:mt-0',
        '[&_img]:size-5 [&_div.flex]:size-5 [&_div.flex]:text-[10px]',
      )}
    >
      <Avatar author={author} details={false} />
    </span>
  )
}

function CompactAgentAvatar() {
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border bg-muted text-primary">
      <AgentAnt className="size-3.5" />
    </span>
  )
}

function ParentIssuePicker({
  issues,
  value,
  onChange,
}: {
  issues: Issue[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected =
    value === 'none' ? undefined : issues.find((issue) => issue.id === value)
  const label = selected
    ? `${formatIssueId(selected.number)}  ${selected.title}`
    : 'No parent'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Parent issue"
            className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        }
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0 sm:w-80">
        <Command>
          <CommandInput placeholder="Search issues…" />
          <CommandList>
            <CommandEmpty>No issues found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="No parent"
                data-checked={value === 'none' ? true : undefined}
                onSelect={() => {
                  onChange('none')
                  setOpen(false)
                }}
              >
                No parent
              </CommandItem>
              {issues.map((issue) => {
                const idLabel = formatIssueId(issue.number)
                return (
                  <CommandItem
                    key={issue.id}
                    value={`${idLabel} ${issue.title}`}
                    data-checked={value === issue.id ? true : undefined}
                    onSelect={() => {
                      onChange(issue.id)
                      setOpen(false)
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-muted-foreground">{idLabel}</span>
                      {'  '}
                      {issue.title}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function IssueCreateForm({
  defaultStatus,
  defaultParentId,
  onOpenChange,
}: {
  defaultStatus?: IssueStatus
  defaultParentId?: string
  onOpenChange: (open: boolean) => void
}) {
  const createIssue = useCreateIssue()
  const { data: issues = [] } = useIssues()
  const { data: agents = [] } = useAgentDefinitions()
  const { data: members = [] } = useWorkspaceMembers(true)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<IssueStatus>(defaultStatus ?? 'backlog')
  const [priority, setPriority] = useState<IssuePriority>('none')
  const [tags, setTags] = useState('')
  const [timeSpentMinutes, setTimeSpentMinutes] = useState('')
  const [parentId, setParentId] = useState<string>(defaultParentId ?? 'none')
  const [owner, setOwner] = useState('none')

  const selectedOwner = parseOwnerValue(owner)
  const selectedMember =
    selectedOwner?.kind === 'account'
      ? members.find((member) => member.id === selectedOwner.id)
      : undefined
  const selectedAgent =
    selectedOwner?.kind === 'agent'
      ? agents.find((agent) => agent.id === selectedOwner.id)
      : undefined

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const minutes = Number(timeSpentMinutes)
    const timeSpent =
      timeSpentMinutes.trim() !== '' && Number.isFinite(minutes) && minutes > 0
        ? [minutes]
        : undefined
    const parsedTags = parseTags(tags)
    const parsedOwner = parseOwnerValue(owner)
    try {
      const { issue: created } = await createIssue.mutateAsync({
        title: trimmed,
        ...(description.trim() ? { description: description.trim() } : {}),
        status,
        priority,
        ...(parsedTags.length ? { tags: parsedTags } : {}),
        ...(timeSpent ? { timeSpent } : {}),
        ...(parentId !== 'none' ? { parentId } : {}),
        ...(parsedOwner ? { owner: parsedOwner } : {}),
      })
      onOpenChange(false)
      const parent = issues.find((issue) => issue.id === created.parentId)
      toast.add({
        type: 'success',
        title: `Created ${formatIssueId(created.number)}`,
        description: parent
          ? `${created.title}  under ${formatIssueId(parent.number)}`
          : `${created.title}  ${ISSUE_STATUS_LABEL[created.status]}`,
      })
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not create issue',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <DialogHeader>
        <DialogTitle>New issue</DialogTitle>
        <DialogDescription>
          Set the fields you need; status defaults to{' '}
          {ISSUE_STATUS_LABEL[defaultStatus ?? 'backlog']}.
        </DialogDescription>
      </DialogHeader>
      <div className="mt-3 space-y-3">
        <div>
          <FieldLabel htmlFor="issue-title">Title</FieldLabel>
          <Input
            id="issue-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Issue title"
            required
            maxLength={500}
            autoFocus
          />
        </div>
        <div>
          <FieldLabel htmlFor="issue-description">Description</FieldLabel>
          <Textarea
            id="issue-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional"
            maxLength={10_000}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Status</FieldLabel>
            <Select
              value={status}
              onValueChange={(value) => {
                if (value) setStatus(value as IssueStatus)
              }}
            >
              <SelectTrigger className="w-full" aria-label="Status">
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <IssueStatusIcon status={status} />
                    {ISSUE_STATUS_LABEL[status]}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ISSUE_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      <span className="flex items-center gap-2">
                        <IssueStatusIcon status={value} />
                        {ISSUE_STATUS_LABEL[value]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Priority</FieldLabel>
            <Select
              value={priority}
              onValueChange={(value) => {
                if (value) setPriority(value as IssuePriority)
              }}
            >
              <SelectTrigger className="w-full" aria-label="Priority">
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <IssuePriorityIcon priority={priority} />
                    {ISSUE_PRIORITY_LABEL[priority]}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ISSUE_PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      <span className="flex items-center gap-2">
                        <IssuePriorityIcon priority={value} />
                        {ISSUE_PRIORITY_LABEL[value]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="issue-tags">Tags</FieldLabel>
          <Input
            id="issue-tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Comma-separated"
          />
        </div>
        <div>
          <FieldLabel htmlFor="issue-time-spent">Time spent</FieldLabel>
          <Input
            id="issue-time-spent"
            type="number"
            min={1}
            step={1}
            value={timeSpentMinutes}
            onChange={(event) => setTimeSpentMinutes(event.target.value)}
            placeholder="Minutes"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Parent</FieldLabel>
            <ParentIssuePicker
              issues={issues}
              value={parentId}
              onChange={setParentId}
            />
          </div>
          <div>
            <FieldLabel>Owner</FieldLabel>
            <Select
              value={owner}
              onValueChange={(value) => setOwner(value ?? 'none')}
            >
              <SelectTrigger className="w-full" aria-label="Owner">
                <SelectValue>
                  {selectedMember ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <CompactPersonAvatar author={selectedMember} />
                      <span className="truncate">
                        {selectedMember.displayName || selectedMember.name}
                      </span>
                    </span>
                  ) : selectedAgent ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <CompactAgentAvatar />
                      <span className="truncate">{selectedAgent.name}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="relative inline-flex size-5 items-center justify-center">
                        <CircleDashed className="size-5" />
                        <UserRound className="absolute size-2.5" />
                      </span>
                      No assignee
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">
                    <span className="flex items-center gap-2">
                      <span className="relative inline-flex size-5 items-center justify-center text-muted-foreground">
                        <CircleDashed className="size-5" />
                        <UserRound className="absolute size-2.5" />
                      </span>
                      No assignee
                    </span>
                  </SelectItem>
                  {members.map((member) => (
                    <SelectItem
                      key={`account:${member.id}`}
                      value={ownerValue({ kind: 'account', id: member.id })}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <CompactPersonAvatar author={member} />
                        <span className="truncate">
                          {member.displayName || member.name}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                  {agents.map((agent) => (
                    <SelectItem
                      key={`agent:${agent.id}`}
                      value={ownerValue({ kind: 'agent', id: agent.id })}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <CompactAgentAvatar />
                        <span className="truncate">{agent.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DialogFooter className="mt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!title.trim() || createIssue.isPending}
        >
          {createIssue.isPending ? 'Creating…' : 'Create issue'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function IssueCreateDialog({
  open,
  onOpenChange,
  defaultStatus,
  defaultParentId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultStatus?: IssueStatus
  defaultParentId?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        {open && (
          <IssueCreateForm
            key={`${defaultStatus ?? 'backlog'}:${defaultParentId ?? 'none'}`}
            defaultStatus={defaultStatus}
            defaultParentId={defaultParentId}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
