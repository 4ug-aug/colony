import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { RunCapsule } from '#/features/runs/run-capsule'
import { useMediaQuery } from '#/hooks/use-media-query'
import { memo, useCallback, useMemo, useRef } from 'react'
import { RoomMessageRow } from './room-message-row'
import { buildFlatTimelineItems } from './thread-helpers'
import type { FlatTimelineItem } from './thread-helpers'
import { QueuedNote } from './queued-note'
import { ThreadSummaryChip } from './thread-summary-chip'
import type { RoomMessage, RoomRun } from './types'

const TimelineEntry = memo(function TimelineEntry({
  item,
  agents,
  mentionHandles,
  coarsePointer,
  currentUserId,
  onEdit,
  onOpenThread,
  onCancelQueued,
  openRun,
  focusMessageId,
  onFocusHandled,
  unreadThreadRootIds,
}: {
  item: FlatTimelineItem
  agents: ReturnType<typeof useAgentDefinitions>['data']
  mentionHandles: string[]
  coarsePointer: boolean
  currentUserId?: string
  onEdit?: (message: RoomMessage) => void
  onOpenThread?: (rootId: string) => void
  onCancelQueued?: (message: RoomMessage) => void
  openRun: (runId: string) => void
  focusMessageId?: string
  onFocusHandled?: () => void
  unreadThreadRootIds: readonly string[]
}) {
  const author = item.message.author
  const isAgent = author.kind === 'agent'
  const queued = Boolean(item.message.queued)
  const canEdit =
    Boolean(onEdit) &&
    !queued &&
    author.kind !== 'agent' &&
    author.id === currentUserId
  const metadata = queued ? (
    <QueuedNote
      onCancel={
        onCancelQueued && author.id === currentUserId
          ? () => onCancelQueued(item.message)
          : undefined
      }
    />
  ) : item.runs.length > 0 || (item.message.replySummary && onOpenThread) ? (
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
      messageId={item.message.id}
      author={author}
      authorName={
        isAgent ? agentNameFrom(agents ?? [], author.id) : author.name
      }
      createdAt={item.createdAt}
      edited={item.message.editedAt != null}
      text={item.message.text}
      attachments={item.message.attachments}
      mentionHandles={mentionHandles}
      coarsePointer={coarsePointer}
      isAgent={isAgent}
      grouped={item.grouped}
      clampAgentBody={isAgent}
      focused={focusMessageId === item.message.id}
      onFocusHandled={onFocusHandled}
      onReply={
        onOpenThread && !queued
          ? () => onOpenThread(item.message.id)
          : undefined
      }
      onEdit={canEdit ? () => onEdit?.(item.message) : undefined}
      metadata={metadata}
      dimmed={queued}
    />
  )
})

export function Timeline({
  messages,
  runs,
  openRun,
  mentionHandles,
  currentUserId,
  onEdit,
  onOpenThread,
  onCancelQueued,
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
  onCancelQueued?: (message: RoomMessage) => void
  focusMessageId?: string
  onFocusHandled?: () => void
  unreadThreadRootIds?: readonly string[]
}) {
  const { data: agents = [] } = useAgentDefinitions()
  const coarsePointer = useMediaQuery('(pointer: coarse)')
  const handlers = useRef({
    openRun,
    onEdit,
    onOpenThread,
    onCancelQueued,
    onFocusHandled,
  })
  handlers.current = {
    openRun,
    onEdit,
    onOpenThread,
    onCancelQueued,
    onFocusHandled,
  }
  const stableOpenRun = useCallback(
    (runId: string) => handlers.current.openRun(runId),
    [],
  )
  const stableEdit = useCallback(
    (message: RoomMessage) => handlers.current.onEdit?.(message),
    [],
  )
  const stableCancelQueued = useCallback(
    (message: RoomMessage) => handlers.current.onCancelQueued?.(message),
    [],
  )
  const stableOpenThread = useCallback(
    (rootId: string) => handlers.current.onOpenThread?.(rootId),
    [],
  )
  const stableFocusHandled = useCallback(
    () => handlers.current.onFocusHandled?.(),
    [],
  )
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
      {items.map((item) => (
        <TimelineEntry
          key={item.id}
          item={item}
          agents={agents}
          mentionHandles={mentionHandles}
          coarsePointer={coarsePointer}
          currentUserId={currentUserId}
          onEdit={onEdit ? stableEdit : undefined}
          onOpenThread={onOpenThread ? stableOpenThread : undefined}
          onCancelQueued={onCancelQueued ? stableCancelQueued : undefined}
          openRun={stableOpenRun}
          focusMessageId={focusMessageId}
          onFocusHandled={onFocusHandled ? stableFocusHandled : undefined}
          unreadThreadRootIds={unreadThreadRootIds}
        />
      ))}
    </div>
  )
}
