import { AgentThinking } from '#/components/ui/agent-thinking'
import { Button } from '#/components/ui/button'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { RunCapsule } from '#/features/runs/run-capsule'
import { useDashboardStore } from '#/features/shell/dashboard-store'
import { RoomSideRail } from '#/features/shell/room-side-rail'
import { useMediaQuery } from '#/hooks/use-media-query'
import { ArrowDown, X } from 'lucide-react'
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { MessageComposer } from './message-composer'
import { RoomMessageRow } from './room-message-row'
import { clearThreadDraft, setThreadDraft, threadDraft } from './thread-drafts'
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
const noAttachments: RoomMessage['attachments'] = []
const noRuns: RoomRun[] = []

// Live results are re-derived from `runs` on every run update, so compare by
// value rather than by object identity.
const ThreadResult = memo(
  function ThreadResult({
    result,
    agentName,
    coarsePointer,
  }: {
    result: RunResultReply
    agentName: string
    coarsePointer: boolean
  }) {
    const author = useMemo(
      () => ({ id: result.agentId, name: agentName, kind: 'agent' as const }),
      [result.agentId, agentName],
    )
    return (
      <RoomMessageRow
        messageId={result.id}
        author={author}
        authorName={agentName}
        createdAt={result.createdAt}
        text={result.text}
        attachments={noAttachments}
        mentionHandles={noMentions}
        coarsePointer={coarsePointer}
        isAgent
      />
    )
  },
  (a, b) =>
    a.agentName === b.agentName &&
    a.coarsePointer === b.coarsePointer &&
    a.result.id === b.result.id &&
    a.result.agentId === b.result.agentId &&
    a.result.text === b.result.text &&
    a.result.createdAt === b.result.createdAt,
)

// A message's run list is regrouped on every run update; same runs in the same
// order means nothing visible changed.
const sameRuns = (a: RoomRun[], b: RoomRun[]) =>
  a.length === b.length && a.every((run, i) => run === b[i])

const ThreadMessage = memo(
  function ThreadMessage({
    message,
    mentionHandles,
    currentUserId,
    onEdit,
    focused,
    onFocusHandled,
    runs = noRuns,
    openRun,
    coarsePointer,
  }: {
    message: RoomMessage
    mentionHandles: string[]
    currentUserId?: string
    onEdit?: (message: RoomMessage) => void
    focused?: boolean
    onFocusHandled?: () => void
    runs?: RoomRun[]
    openRun?: (runId: string) => void
    coarsePointer: boolean
  }) {
    const canEdit =
      Boolean(onEdit) &&
      message.author.kind !== 'agent' &&
      message.author.id === currentUserId
    const edit = useCallback(() => onEdit?.(message), [onEdit, message])
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
        coarsePointer={coarsePointer}
        isAgent={message.author.kind === 'agent'}
        focused={focused}
        onFocusHandled={onFocusHandled}
        onEdit={canEdit ? edit : undefined}
        metadata={metadata}
      />
    )
  },
  (a, b) => {
    for (const key of Object.keys(a) as (keyof typeof a)[])
      if (key !== 'runs' && a[key] !== b[key]) return false
    return sameRuns(a.runs ?? noRuns, b.runs ?? noRuns)
  },
)

export type RoomThreadRailProps = {
  roomId: string
  roomName: string
  rootId: string
  /** Room-wide runs; filtered down to this thread's root and replies. */
  runs?: RoomRun[]
  openRun?: (runId: string) => void
  mentionHandles: string[]
  mentionableAccounts: MentionableAccount[]
  currentUserId?: string
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
}

function RoomThreadRailContent({
  roomId,
  roomName,
  rootId,
  runs = [],
  openRun,
  mentionHandles,
  mentionableAccounts,
  currentUserId,
  sendReply,
  editMessage,
  focusReplyId,
  onFocusReplyHandled,
}: RoomThreadRailProps) {
  const [draftText, setDraftText] = useState(() => threadDraft(rootId))
  const onDraftChange = (text: string) => {
    setThreadDraft(rootId, text)
    setDraftText(text)
  }
  const onDraftSubmitted = () => {
    clearThreadDraft(rootId)
    setDraftText('')
  }
  const { root, replies, results, isLoading, error } = useRoomThread(
    roomId,
    rootId,
  )
  const { data: agents = [] } = useAgentDefinitions()
  const coarsePointer = useMediaQuery('(pointer: coarse)')
  const closeSideSurface = useDashboardStore.getState().closeSideSurface
  const [editingReply, setEditingReply] = useState<RoomMessage>()
  const threadRuns = useMemo(
    () => groupRunsByTrigger(runsForThread(runs, root, replies)),
    [replies, root, runs],
  )
  // Dashboard passes fresh callbacks every render; keep row props stable.
  const handlers = useRef({ openRun, onFocusReplyHandled })
  handlers.current = { openRun, onFocusReplyHandled }
  const stableOpenRun = useCallback(
    (runId: string) => handlers.current.openRun?.(runId),
    [],
  )
  const stableFocusHandled = useCallback(
    () => handlers.current.onFocusReplyHandled?.(),
    [],
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const timelineItems = useMemo(
    () =>
      [
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
      ].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
    [replies, results],
  )
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
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label="Close thread"
          onClick={closeSideSurface}
        >
          <X />
        </Button>
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
                  runs={threadRuns.get(root.id)}
                  openRun={openRun ? stableOpenRun : undefined}
                  coarsePointer={coarsePointer}
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
                      onFocusHandled={
                        onFocusReplyHandled ? stableFocusHandled : undefined
                      }
                      runs={threadRuns.get(item.reply.id)}
                      openRun={openRun ? stableOpenRun : undefined}
                      coarsePointer={coarsePointer}
                    />
                  ) : (
                    <ThreadResult
                      key={item.id}
                      result={item.result}
                      agentName={agentNameFrom(agents, item.result.agentId)}
                      coarsePointer={coarsePointer}
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
        />
      </div>
    </>
  )
}

export function RoomThreadRail(props: RoomThreadRailProps) {
  return (
    <RoomSideRail
      label="Thread"
      description="Thread root, replies, and composer"
      className="bg-[var(--room-conversation)]"
      sheetClassName="room-surface"
    >
      <RoomThreadRailContent {...props} />
    </RoomSideRail>
  )
}
