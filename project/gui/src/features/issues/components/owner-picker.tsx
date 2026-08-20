import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { toast } from '#/components/ui/toast'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import { cn } from '#/lib/utils'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { formatIssueId } from '../format'
import { OwnerDisplay } from './owner-display'
import { ownerValue, parseOwnerValue } from '../owner-encoding'
import { railTriggerClass } from './property-picker'
import type { Issue } from '../types'
import { useAssignIssue } from '../use-issues'
import { useWorkspaceMembers } from '../use-workspace-members'

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
