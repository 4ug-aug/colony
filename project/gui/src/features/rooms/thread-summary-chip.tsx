import { AccountFace } from '#/components/avatar'
import { AgentMark } from '#/features/agents/agent-mark'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
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
  const repliesLabel = `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`
  return (
    <button
      type="button"
      className={`room-meta-control${unread ? ' room-meta-control--unread' : ''}`}
      aria-label={unread ? `${replyCount} unread ${repliesLabel}` : repliesLabel}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onOpen}
    >
      <ReplyAvatars participants={participants} />
      {unread && (
        <span
          className="size-2 rounded-full bg-green-500"
          aria-hidden="true"
        />
      )}
      <span>{repliesLabel}</span>
      <span className="room-meta-secondary">
        {timestamp(latestReplyAt)}
      </span>
    </button>
  )
}
