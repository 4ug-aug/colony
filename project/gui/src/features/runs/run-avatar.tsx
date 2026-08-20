import { AgentMark } from '#/features/agents/agent-mark'
import type { RoomRun } from '#/features/rooms/types'

export function RunAvatar({ run }: { run: RoomRun }) {
  return <AgentMark agentId={run.agentId} />
}
