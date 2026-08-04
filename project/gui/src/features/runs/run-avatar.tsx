import { Avatar as AgentAvatar, AvatarFallback } from '#/components/ui/avatar'
import { AgentAnt } from '#/components/avatar'
import { useAgentName } from '#/features/agents/use-agent-definitions'
import type { RoomRun } from '#/features/rooms/types'

export function RunAvatar({ run }: { run: RoomRun }) {
  const name = useAgentName(run.agentId)
  return (
    <AgentAvatar size="sm" title={name}>
      <AvatarFallback className="bg-muted text-primary border">
        <AgentAnt className="size-4" />
      </AvatarFallback>
    </AgentAvatar>
  )
}
