import { ChamberEmptyState } from '#/features/rooms/chamber-empty-state'
import { AgentThinking } from '#/components/ui/agent-thinking'
import { Button } from '#/components/ui/button'
import type { MessageComposerHandle } from '#/features/rooms/message-composer'
import { MessageComposer } from '#/features/rooms/message-composer'
import { RoomThreadRail } from '#/features/rooms/room-thread-rail'
import { Timeline } from '#/features/rooms/room-timeline'
import type {
  Author,
  MentionableAccount,
  Room,
  RoomMessage,
  RoomRun,
} from '#/features/rooms/types'
import { ActiveAgents } from '#/features/runs/active-agents'
import { RunActivityRail } from '#/features/runs/run-activity-rail'
import { ArrowDown } from 'lucide-react'
import type { RefObject } from 'react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDashboardStore } from './dashboard-store'

const bottomScrollThreshold = 150
const historyTopThreshold = 80

export function RoomView({
  user,
  room,
  messages,
  runs,
  loading,
  error,
  draft,
  setDraft,
  send,
  sendReply,
  edit,
  cancel,
  cancelQueued,
  mentionableAccounts,
  loadOlder,
  loadingOlder,
  threadAttentionRootIds,
  focusMessageId,
  clearFocusMessage,
  composer,
  openMachine,
}: {
  user: Author
  room: Room | undefined
  messages: RoomMessage[]
  runs: RoomRun[]
  loading: boolean
  error: string | undefined
  draft: string
  setDraft: (text: string) => void
  send: (text: string, files: File[]) => Promise<unknown>
  sendReply: (
    rootId: string,
    text: string,
    files: File[],
  ) => Promise<RoomMessage | undefined>
  edit: (messageId: string, text: string) => Promise<RoomMessage | undefined>
  cancel: (runId: string) => unknown
  cancelQueued: (message: RoomMessage) => unknown
  mentionableAccounts: MentionableAccount[]
  loadOlder: () => unknown
  loadingOlder: boolean
  threadAttentionRootIds: string[]
  focusMessageId: string | undefined
  clearFocusMessage: () => void
  composer: RefObject<MessageComposerHandle | null>
  openMachine?: (sandboxId: string) => void
}) {
  const surface = useDashboardStore((state) => state.location.surface)
  const pendingThreadFocus = useDashboardStore(
    (state) => state.pendingThreadFocus,
  )
  const { openThread, openActivity, closeSideSurface, clearThreadFocus } =
    useDashboardStore.getState()
  // Markdown is memo()'d, so this has to keep its identity between renders or
  // every message re-parses on every commit.
  const mentionHandles = useMemo(
    () => [
      user.name,
      ...mentionableAccounts.map((account) => account.username ?? account.name),
    ],
    [user.name, mentionableAccounts],
  )
  const [editingMessage, setEditingMessage] = useState<RoomMessage>()
  const scrollRef = useRef<HTMLElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const followRoomRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)

  const submit = async (text: string, files: File[]) => {
    if (editingMessage) {
      if (!text.trim()) return false
      const result = await edit(editingMessage.id, text)
      if (result) {
        setEditingMessage(undefined)
        setDraft('')
      }
      return Boolean(result)
    }
    if (!text.trim() && !files.length) return false
    const result = await send(text, files)
    if (result) setDraft('')
    return Boolean(result)
  }

  const cancelEdit = () => {
    setEditingMessage(undefined)
    setDraft('')
  }

  useLayoutEffect(() => {
    followRoomRef.current = true
    setEditingMessage(undefined)
  }, [room?.id])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || loading || (!followRoomRef.current && !atBottomRef.current))
      return
    el.scrollTop = 0
    atBottomRef.current = true
    setAtBottom(true)
  }, [loading, messages, room?.id, runs])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const timeline = timelineRef.current
    if (!el || !timeline) return
    const observer = new ResizeObserver(() => {
      if (followRoomRef.current || atBottomRef.current) el.scrollTop = 0
    })
    observer.observe(timeline)
    return () => observer.disconnect()
  }, [room?.id])

  useLayoutEffect(() => {
    if (!pendingThreadFocus || focusMessageId !== pendingThreadFocus.rootId)
      return
    useDashboardStore.setState({ pendingThreadFocus: undefined })
    openThread(pendingThreadFocus.rootId, pendingThreadFocus.focusReplyId)
  }, [focusMessageId, pendingThreadFocus, openThread])

  useLayoutEffect(() => {
    if (!focusMessageId || loading) return
    followRoomRef.current = false
    atBottomRef.current = false
    setAtBottom(false)
    const el = scrollRef.current?.querySelector(
      `[data-message-id="${CSS.escape(focusMessageId)}"]`,
    )
    el?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [focusMessageId, loading, messages])

  const activeRun =
    surface?.kind === 'activity'
      ? runs.find(({ id }) => id === surface.runId)
      : undefined
  const activeRootId = surface?.kind === 'thread' ? surface.rootId : undefined
  const activityTriggerMessage = activeRun
    ? messages.find(({ id }) => id === activeRun.triggerMessageId)
    : undefined

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className="room-pane relative flex min-h-0 min-w-0 flex-1 flex-col"
        onPointerDown={() => {
          if (surface) closeSideSurface()
        }}
      >
        <div className="relative min-h-0 flex-1">
          <section
            key={room?.id}
            ref={scrollRef}
            className="room-timeline no-scrollbar flex h-full flex-col-reverse overflow-y-auto"
            aria-busy={loading}
            onPointerDown={() => {
              followRoomRef.current = false
            }}
            onTouchMove={() => {
              followRoomRef.current = false
            }}
            onWheel={() => {
              followRoomRef.current = false
            }}
            onScroll={() => {
              const el = scrollRef.current
              if (!el) return
              if (
                el.scrollHeight - el.clientHeight - Math.abs(el.scrollTop) <=
                historyTopThreshold
              )
                void loadOlder()
              const nextAtBottom =
                Math.abs(el.scrollTop) < bottomScrollThreshold
              atBottomRef.current = nextAtBottom
              setAtBottom(nextAtBottom)
            }}
          >
            <div ref={timelineRef} className="w-full shrink-0">
              {loadingOlder && (
                <div
                  className="flex justify-center pb-4 text-sm text-muted-foreground"
                  role="status"
                >
                  <AgentThinking label="Loading older messages…" />
                </div>
              )}
              {loading ? (
                <div
                  className="flex justify-center py-12 text-sm text-muted-foreground"
                  role="status"
                >
                  <AgentThinking label="Loading room…" />
                </div>
              ) : (
                <Timeline
                  messages={messages}
                  runs={runs}
                  openRun={openActivity}
                  currentUserId={user.id}
                  focusMessageId={focusMessageId}
                  onFocusHandled={clearFocusMessage}
                  unreadThreadRootIds={threadAttentionRootIds}
                  onEdit={(message) => {
                    setEditingMessage(message)
                    setDraft(message.text)
                  }}
                  onOpenThread={openThread}
                  onCancelQueued={cancelQueued}
                  mentionHandles={mentionHandles}
                  clampAgentMessages={room?.kind !== 'chamber'}
                  emptyState={
                    room?.agentDefinitionId ? (
                      <ChamberEmptyState agentId={room.agentDefinitionId} />
                    ) : undefined
                  }
                />
              )}
            </div>
          </section>
          {!atBottom && (
            <Button
              type="button"
              size="sm"
              className="absolute right-5 bottom-4 rounded-sm shadow-md"
              onClick={() =>
                scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
              }
            >
              To the bottom
              <ArrowDown data-icon="inline-end" />
            </Button>
          )}
        </div>
        <div className="room-composer-dock shrink-0">
          <MessageComposer
            key={room?.id}
            ref={composer}
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            disabled={loading || !room}
            roomName={room?.name ?? 'room'}
            chamberAgentName={room?.kind === 'chamber' ? room.name : undefined}
            mentionableAccounts={mentionableAccounts}
            editing={Boolean(editingMessage)}
            onCancelEdit={cancelEdit}
          />
          <div>
            <ActiveAgents
              roomId={room?.id}
              runs={runs}
              cancel={(runId) => void cancel(runId)}
              openRun={openActivity}
            />
          </div>
          {error && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      {activeRun && (
        <RunActivityRail
          key={activeRun.id}
          run={activeRun}
          triggerMessage={activityTriggerMessage}
          onCancel={() => void cancel(activeRun.id)}
          onOpenMachine={openMachine}
        />
      )}
      {activeRootId && room && (
        <RoomThreadRail
          key={activeRootId}
          roomId={room.id}
          roomName={`${room.name} thread`}
          rootId={activeRootId}
          runs={runs}
          openRun={openActivity}
          mentionHandles={mentionHandles}
          mentionableAccounts={mentionableAccounts}
          currentUserId={user.id}
          sendReply={sendReply}
          editMessage={edit}
          cancelQueued={cancelQueued}
          focusReplyId={
            surface?.kind === 'thread' ? surface.focusReplyId : undefined
          }
          onFocusReplyHandled={clearThreadFocus}
        />
      )}
    </div>
  )
}
