import { AccountFace, AgentAnt } from '#/components/avatar'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { cn } from '#/lib/utils'
import { CircleDashed, UserRound } from 'lucide-react'
import type { IssueActor } from './types'
import { useWorkspaceMembers } from './use-workspace-members'

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
