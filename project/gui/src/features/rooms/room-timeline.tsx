import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { RunCapsule } from '#/features/runs/run-capsule'
import { useMemo } from 'react'
import { RoomMessageRow } from './room-message-row'
import { buildFlatTimelineItems } from './thread-helpers'
import { ThreadSummaryChip } from './thread-summary-chip'
import type { RoomMessage, RoomRun } from './types'

export function Timeline({
  messages,
  runs,
  openRun,
  mentionHandles,
  currentUserId,
  onEdit,
  onOpenThread,
  focusMessageId,
  onFocusHandled,
  unreadThreadRootIds = [],
}: {
  messages: RoomMessage[]
  runs: RoomRun[]
  openRun: (runId: string) => void
  mentionHandles: string[]
  currentUserId?: string
  onEdit?: (message: RoomMessage) => void
  onOpenThread?: (rootId: string) => void
  focusMessageId?: string
  onFocusHandled?: () => void
  unreadThreadRootIds?: readonly string[]
}) {
  const { data: agents = [] } = useAgentDefinitions()
  const items = useMemo(
    () => buildFlatTimelineItems(messages, runs),
    [messages, runs],
  )

  if (!items.length)
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No messages yet. Start the conversation.
      </p>
    )
  return (
    <div>
      {items.map((item) => {
        const author = item.message.author
        const isAgent = item.message.author.kind === 'agent'
        const canEdit =
          Boolean(onEdit) &&
          item.message.author.kind !== 'agent' &&
          item.message.author.id === currentUserId
        const metadata =
          item.runs.length > 0 || (item.message.replySummary && onOpenThread) ? (
            <>
              {item.runs.map((run) => (
                <RunCapsule
                  key={run.id}
                  run={run}
                  openRun={openRun}
                  showModel={item.runs.length > 1}
                />
              ))}
              {item.message.replySummary && onOpenThread && (
                <ThreadSummaryChip
                  replyCount={item.message.replySummary.replyCount}
                  participants={item.message.replySummary.participants}
                  latestReplyAt={item.message.replySummary.latestReplyAt}
                  unread={unreadThreadRootIds.includes(item.message.id)}
                  onOpen={() => onOpenThread(item.message.id)}
                />
              )}
            </>
          ) : undefined
        return (
          <RoomMessageRow
            key={item.id}
            messageId={item.message.id}
            author={author}
            authorName={
              isAgent ? agentNameFrom(agents, author.id) : author.name
            }
            createdAt={item.createdAt}
            edited={item.message.editedAt != null}
            text={item.message.text}
            attachments={item.message.attachments}
            mentionHandles={mentionHandles}
            isAgent={isAgent}
            grouped={item.grouped}
            clampAgentBody={isAgent}
            focused={focusMessageId === item.message.id}
            onFocusHandled={onFocusHandled}
            onReply={
              onOpenThread
                ? () => onOpenThread(item.message.id)
                : undefined
            }
            onEdit={canEdit ? () => onEdit?.(item.message) : undefined}
            metadata={metadata}
          />
        )
      })}
    </div>
  )
}
