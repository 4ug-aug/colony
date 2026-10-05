import { AgentMark } from '#/features/agents/agent-mark'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'

/** A Chamber before its first message: the agent's mark, who it is, and that it is private. */
export function ChamberEmptyState({ agentId }: { agentId: string }) {
  const { data: agents = [] } = useAgentDefinitions()
  const agent = agents.find(({ id }) => id === agentId)
  const name = agent?.name ?? agentId
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-border/70 bg-muted/40">
        <AgentMark agentId={agentId} className="size-9" />
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="text-sm font-semibold">{name}&rsquo;s chamber</h2>
        {agent?.description && (
          <p className="text-sm text-muted-foreground">{agent.description}</p>
        )}
        <p className="text-xs text-muted-foreground">
          A private chamber in the colony. Only you and {name} are in here, and
          every message is a task.
        </p>
      </div>
    </div>
  )
}
