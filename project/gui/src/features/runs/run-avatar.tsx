import { AgentMark } from '#/features/agents/agent-mark'
import type { RoomRun } from '#/features/rooms/types'

export function RunAvatar({
  run,
  className,
}: {
  run: RoomRun
  className?: string
}) {
  return <AgentMark agentId={run.agentId} className={className} />
}
