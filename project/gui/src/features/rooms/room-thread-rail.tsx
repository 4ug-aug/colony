import { AgentThinking } from '#/components/ui/agent-thinking'
import { Button } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '#/components/ui/sheet'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { RunCapsule } from '#/features/runs/run-capsule'
import { useMediaQuery } from '#/hooks/use-media-query'
import { ArrowDown, X } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { MessageComposer } from './message-composer'
import { RoomMessageRow } from './room-message-row'
import { groupRunsByTrigger, runsForThread } from './thread-helpers'
import {
  acknowledgeNewReplies,
  applyIncomingReplies,
  applyScrollMetrics,
  initialThreadScrollState,
} from './thread-scroll'
import type {
  MentionableAccount,
  RoomMessage,
  RoomRun,
  RunResultReply,
} from './types'
import { useRoomThread } from './use-room-thread'

const noMentions: string[] = []

function ThreadResult({
  result,
  agentName,
}: {
  result: RunResultReply
  agentName: string
}) {
  return (
    <RoomMessageRow
      messageId={result.id}
      author={{ id: result.agentId, name: agentName, kind: 'agent' }}
      authorName={agentName}
      createdAt={result.createdAt}
      text={result.text}
      attachments={[]}
      mentionHandles={noMentions}
      isAgent
    />
  )
}

function ThreadMessage({
  message,
  mentionHandles,
  currentUserId,
  onEdit,
  focused,
  onFocusHandled,
  runs = [],
  openRun,
}: {
  message: RoomMessage
  mentionHandles: string[]
  currentUserId?: string
  onEdit?: (message: RoomMessage) => void
  focused?: boolean
  onFocusHandled?: () => void
  runs?: RoomRun[]
  openRun?: (runId: string) => void
}) {
  const canEdit =
    Boolean(onEdit) &&
    message.author.kind !== 'agent' &&
    message.author.id === currentUserId
  const metadata =
    runs.length > 0 && openRun
      ? runs.map((run) => (
          <RunCapsule
            key={run.id}
            run={run}
            openRun={openRun}
            showModel={runs.length > 1}
          />
        ))
      : undefined
  return (
    <RoomMessageRow
      messageId={message.id}
      author={message.author}
      authorName={message.author.name}
      createdAt={message.createdAt}
      edited={message.editedAt != null}
      text={message.text}
      attachments={message.attachments}
      mentionHandles={mentionHandles}
      isAgent={message.author.kind === 'agent'}
      focused={focused}
      onFocusHandled={onFocusHandled}
      onEdit={canEdit ? () => onEdit?.(message) : undefined}
      metadata={metadata}
    />
  )
}

function RoomThreadRailContent({
  roomId,
  roomName,
  rootId,
  liveReplies,
  runs = [],
  openRun,
  mentionHandles,
  mentionableAccounts,
  currentUserId,
  onClose,
  sendReply,
  editMessage,
  focusReplyId,
  onFocusReplyHandled,
  draftText,
  onDraftChange,
  onDraftSubmitted,
}: {
  roomId: string
  roomName: string
  rootId: string
  liveReplies: RoomMessage[]
  /** Room-wide runs; filtered down to this thread's root and replies. */
  runs?: RoomRun[]
  openRun?: (runId: string) => void
  mentionHandles: string[]
  mentionableAccounts: MentionableAccount[]
  currentUserId?: string
  onClose?: () => void
  sendReply: (
    rootId: string,
    text: string,
    files: File[],
  ) => Promise<RoomMessage | undefined>
  editMessage: (
    messageId: string,
    text: string,
  ) => Promise<RoomMessage | undefined>
  /** A search hit's matching reply id to scroll to and highlight once loaded. */
  focusReplyId?: string
  onFocusReplyHandled?: () => void
  /** The one in-memory draft kept for this root across rail switching/closing. */
  draftText: string
  onDraftChange: (text: string) => void
  /** Clears this root's draft after a reply or edit is submitted successfully. */
  onDraftSubmitted: () => void
}) {
  const { root, replies, results, isLoading, error } = useRoomThread(
    roomId,
    rootId,
    liveReplies,
    runs,
  )
  const { data: agents = [] } = useAgentDefinitions()
  const [editingReply, setEditingReply] = useState<RoomMessage>()
  const threadRuns = groupRunsByTrigger(runsForThread(runs, root, replies))
  const scrollRef = useRef<HTMLDivElement>(null)
  const timelineItems = [
    ...replies.map((reply) => ({
      id: reply.id,
      createdAt: reply.createdAt,
      reply,
    })),
    ...results.map((result) => ({
      id: result.id,
      createdAt: result.createdAt,
      result,
    })),
  ].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  const replyCount = replies.length + results.length

  const [scrollState, setScrollState] = useState(initialThreadScrollState)
  const previousReplyCountRef = useRef(replyCount)
  if (previousReplyCountRef.current !== replyCount) {
    const delta = replyCount - previousReplyCountRef.current
    previousReplyCountRef.current = replyCount
    if (delta > 0) {
      const next = applyIncomingReplies(scrollState, delta)
      if (next !== scrollState) setScrollState(next)
    }
  }

  useLayoutEffect(() => {
    if (!focusReplyId) return
    const target = scrollRef.current?.querySelector(
      `[data-message-id="${CSS.escape(focusReplyId)}"]`,
    )
    target?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [focusReplyId, replies])

  const previousContentRef = useRef<
    { replyCount: number; root: RoomMessage | undefined } | undefined
  >(undefined)
  useLayoutEffect(() => {
    const previous = previousContentRef.current
    previousContentRef.current = { replyCount, root }
    // Crossing the near-bottom threshold is not new content and must not snap the scroll.
    if (previous?.replyCount === replyCount && previous.root === root) return
    if (focusReplyId) return
    const el = scrollRef.current
    if (el && scrollState.atBottom) el.scrollTop = el.scrollHeight
  }, [replyCount, root, focusReplyId, scrollState.atBottom])

  const submit = async (text: string, files: File[]) => {
    if (editingReply) {
      if (!text.trim()) return false
      const result = await editMessage(editingReply.id, text)
      if (result) {
        setEditingReply(undefined)
        onDraftSubmitted()
      }
      return Boolean(result)
    }
    if (!text.trim() && !files.length) return false
    const result = await sendReply(rootId, text, files)
    if (result) onDraftSubmitted()
    return Boolean(result)
  }

  return (
    <>
      <div className="room-header flex h-14 shrink-0 items-center gap-2">
        <p className="font-semibold">Thread</p>
        <p className="text-xs text-muted-foreground">
          {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
        </p>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label="Close thread"
            onClick={onClose}
          >
            <X />
          </Button>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="room-thread-timeline h-full overflow-y-auto"
          onScroll={() => {
            const el = scrollRef.current
            if (!el) return
            setScrollState((current) =>
              applyScrollMetrics(current, {
                scrollTop: el.scrollTop,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
              }),
            )
          }}
        >
          {isLoading && !root && (
            <p className="text-sm text-muted-foreground" role="status">
              <AgentThinking label="Loading thread" />
            </p>
          )}
          {error && !root && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {root && (
            <>
              <div className="border-b border-[var(--room-divider)] pb-4">
                <ThreadMessage
                  message={root}
                  mentionHandles={mentionHandles}
                  currentUserId={currentUserId}
                  runs={threadRuns.get(root.id) ?? []}
                  openRun={openRun}
                />
              </div>
              <div className="pt-5">
                {timelineItems.map((item) =>
                  'reply' in item ? (
                    <ThreadMessage
                      key={item.id}
                      message={item.reply}
                      mentionHandles={mentionHandles}
                      currentUserId={currentUserId}
                      onEdit={setEditingReply}
                      focused={focusReplyId === item.reply.id}
                      onFocusHandled={onFocusReplyHandled}
                      runs={threadRuns.get(item.reply.id) ?? []}
                      openRun={openRun}
                    />
                  ) : (
                    <ThreadResult
                      key={item.id}
                      result={item.result}
                      agentName={agentNameFrom(agents, item.result.agentId)}
                    />
                  ),
                )}
                {!timelineItems.length && (
                  <p className="text-sm text-muted-foreground">
                    No replies yet.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        {scrollState.newReplyCount > 0 && (
          <Button
            type="button"
            size="sm"
            className="absolute right-4 bottom-3 rounded-full shadow-md"
            onClick={() => {
              setScrollState(acknowledgeNewReplies)
              const el = scrollRef.current
              el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
            }}
          >
            {scrollState.newReplyCount}{' '}
            {scrollState.newReplyCount === 1 ? 'new reply' : 'new replies'}
            <ArrowDown data-icon="inline-end" />
          </Button>
        )}
      </div>
      <div className="room-thread-composer-dock shrink-0">
        <MessageComposer
          value={draftText}
          onChange={onDraftChange}
          onSubmit={submit}
          disabled={!root}
          roomName={roomName}
          mentionableAccounts={mentionableAccounts}
          editing={Boolean(editingReply)}
          onCancelEdit={() => {
            setEditingReply(undefined)
            onDraftChange('')
          }}
          appearance="room"
        />
      </div>
    </>
  )
}

export function RoomThreadRail({
  exiting = false,
  onExited,
  ...contentProps
}: Parameters<typeof RoomThreadRailContent>[0] & {
  /** Playing the exit transition before the next surface enters (never stacked). */
  exiting?: boolean
  onExited?: () => void
}) {
  const inline = useMediaQuery('(min-width: 1024px)')

  if (inline)
    return (
      <aside
        className={`flex h-full min-h-0 w-full flex-col bg-[var(--room-conversation)] ${
          exiting
            ? 'animate-out fade-out-0 slide-out-to-right-2 fill-mode-forwards duration-100'
            : 'animate-in fade-in-0 slide-in-from-right-2 fill-mode-backwards duration-200'
        }`}
        aria-label="Thread"
        onAnimationEnd={
          exiting
            ? (event) => {
                if (event.target !== event.currentTarget) return
                onExited?.()
              }
            : undefined
        }
      >
        <RoomThreadRailContent {...contentProps} />
      </aside>
    )

  return (
    <Sheet
      open={!exiting}
      onOpenChange={(open) => {
        if (!open && !exiting) contentProps.onClose?.()
      }}
      onOpenChangeComplete={(open) => {
        if (!open && exiting) onExited?.()
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="room-surface flex w-full max-w-none flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetTitle className="sr-only">Thread</SheetTitle>
        <SheetDescription className="sr-only">
          Thread root, replies, and composer
        </SheetDescription>
        <RoomThreadRailContent {...contentProps} />
      </SheetContent>
    </Sheet>
  )
}
