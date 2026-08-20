import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { toast } from '#/components/ui/toast'
import { cn } from '#/lib/utils'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { formatIssueId } from './format'
import { IssuePriorityIcon, IssueStatusIcon } from './issue-icons'
import type { Issue, IssuePriority, IssueStatus } from './types'
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABEL,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUSES,
} from './types'
import { useIssues, useUpdateIssue } from './use-issues'

const iconTriggerClass =
  'inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40'

export const railTriggerClass =
  'inline-flex h-8 max-w-full items-center gap-2 rounded-sm px-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40'

export function LabelCheck({ checked }: { checked: boolean }) {
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
