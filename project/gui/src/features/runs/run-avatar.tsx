import { Avatar as AgentAvatar, AvatarFallback } from '#/components/ui/avatar'
import { AgentAnt } from '#/components/avatar'
import { agentName } from './run-helpers'
import type { RoomRun } from '#/features/rooms/types'

export function RunAvatar({ run }: { run: RoomRun }) {
  return (
    <AgentAvatar size="sm" title={agentName(run.agentId)}>
      <AvatarFallback className="bg-muted text-primary border">
        <AgentAnt className="size-4" />
      </AvatarFallback>
    </AgentAvatar>
  )
}
