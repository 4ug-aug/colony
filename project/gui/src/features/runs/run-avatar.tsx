import { Bot } from 'lucide-react'
import { Avatar as AgentAvatar, AvatarFallback } from '#/components/ui/avatar'
import { agentName } from './run-helpers'
import type { RoomRun } from '#/features/rooms/types'

export function RunAvatar({ run }: { run: RoomRun }) {
  return (
    <AgentAvatar size="sm" title={agentName(run.agentId)}>
      <AvatarFallback className="bg-primary/10 text-primary">
        <Bot className="size-3" />
      </AvatarFallback>
    </AgentAvatar>
  )
}
