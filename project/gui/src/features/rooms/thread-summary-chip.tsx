import { AgentAnt, timestamp } from '#/components/avatar'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'

function ReplyAvatars({ participantIds }: { participantIds: string[] }) {
  const { data: agents = [] } = useAgentDefinitions()
  if (!participantIds.length) return null
  const agentIds = new Set(agents.map((agent) => agent.id))
  return (
    <div className="flex -space-x-1.5">
      {participantIds.map((id) => {
        const isAgent = agentIds.has(id)
        return (
          <div
            key={id}
            className={`flex size-5 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold ${
              isAgent ? 'text-primary' : 'text-muted-foreground'
            }`}
            aria-hidden="true"
            title={isAgent ? agentNameFrom(agents, id) : undefined}
          >
            {isAgent ? (
              <AgentAnt className="size-3.5" />
            ) : (
              id.slice(0, 1).toUpperCase()
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ThreadSummaryChip({
  replyCount,
  participantIds,
  latestReplyAt,
  onOpen,
}: {
  replyCount: number
  participantIds: string[]
  latestReplyAt: number
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 py-1 pl-1 pr-2 text-xs text-muted-foreground hover:bg-muted cursor-pointer"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onOpen}
    >
      <ReplyAvatars participantIds={participantIds} />
      <span className="font-medium text-foreground">
        {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
      </span>
      <span>Last reply {timestamp(latestReplyAt)}</span>
    </button>
  )
}
