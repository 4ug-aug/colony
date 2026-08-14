import { AgentAnt, timestamp } from '#/components/avatar'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { cn } from '#/lib/utils'
import type { ThreadParticipant } from './types'

function ReplyAvatars({ participants }: { participants: ThreadParticipant[] }) {
  const { data: agents = [] } = useAgentDefinitions()
  if (!participants.length) return null
  const agentIds = new Set(agents.map((agent) => agent.id))
  return (
    <div className="flex -space-x-1.5">
      {participants.map((participant) => {
        const isAgent = agentIds.has(participant.id)
        return (
          <div
            key={participant.id}
            className={`flex size-5 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold ${
              isAgent ? 'text-primary' : 'text-muted-foreground'
            }`}
            aria-hidden="true"
            title={
              isAgent
                ? agentNameFrom(agents, participant.id)
                : participant.name
            }
          >
            {isAgent ? (
              <AgentAnt className="size-3.5" />
            ) : (
              participant.name.slice(0, 1).toUpperCase()
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ThreadSummaryChip({
  replyCount,
  participants,
  latestReplyAt,
  unread = false,
  onOpen,
}: {
  replyCount: number
  participants: ThreadParticipant[]
  latestReplyAt: number
  unread?: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border py-1 pl-1 pr-2 text-xs hover:bg-muted cursor-pointer',
        unread
          ? 'border-green-500/40 bg-green-500/10 text-foreground'
          : 'bg-muted/30 text-muted-foreground',
      )}
      aria-label={
        unread
          ? `${replyCount} unread ${replyCount === 1 ? 'reply' : 'replies'}`
          : undefined
      }
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onOpen}
    >
      <ReplyAvatars participants={participants} />
      {unread && (
        <span className="size-2 rounded-full bg-green-500" aria-hidden="true" />
      )}
      <span className="font-medium text-foreground">
        {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
      </span>
      <span>Last reply {timestamp(latestReplyAt)}</span>
    </button>
  )
}
