import { AccountFace } from '#/components/avatar'
import { AgentMark } from '#/features/agents/agent-mark'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import { cn } from '#/lib/utils'
import { timestamp } from './format'
import type { ThreadParticipant } from './types'

function ReplyAvatars({ participants }: { participants: ThreadParticipant[] }) {
  const { data: agents = [] } = useAgentDefinitions()
  if (!participants.length) return null
  const agentIds = new Set(agents.map((agent) => agent.id))
  return (
    <div className="flex -space-x-1.5">
      {participants.map((participant) => {
        const isAgent = agentIds.has(participant.id)
        return isAgent ? (
          <AgentMark
            key={participant.id}
            agentId={participant.id}
            className="size-5"
          />
        ) : (
          <AccountFace
            key={participant.id}
            name={participant.name}
            className="size-5 border border-border text-[10px]"
            title={participant.name}
          />
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
