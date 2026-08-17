import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#/components/ui/resizable'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { AccountSettingsPage } from '#/features/account/account-settings'
import type { BulletinsPageHandle } from '#/features/bulletins/bulletins-page'
import { BulletinsPage } from '#/features/bulletins/bulletins-page'
import { DocSessionHeader, DocsPage } from '#/features/docs/docs-page'
import { GrillSessionHeader, GrillsPage } from '#/features/grills/grills-page'
import { IssuesPage } from '#/features/issues/issues-page'
import type { IssueStatus } from '#/features/issues/types'
import { MembersPanel } from '#/features/members/members-panel'
import { OneshotPanel } from '#/features/oneshot/oneshot-panel'
import type { MessageComposerHandle } from '#/features/rooms/message-composer'
import { MessageComposer } from '#/features/rooms/message-composer'
import { MessageSearchCommand } from '#/features/rooms/message-search-command'
import { navigationForSearchHit } from '#/features/rooms/message-search-navigation'
import { RoomThreadRail } from '#/features/rooms/room-thread-rail'
import { Timeline } from '#/features/rooms/room-timeline'
import type { ThreadDrafts } from '#/features/rooms/thread-drafts'
import {
  emptyThreadDrafts,
  threadDraft,
  withThreadDraft,
  withoutThreadDraft,
} from '#/features/rooms/thread-drafts'
import type {
  ThreadTransitionState,
  ThreadTransitionSurface,
} from '#/features/rooms/thread-transition'
import {
  finishThreadExit,
  requestThreadSurface,
  sameThreadSurface,
} from '#/features/rooms/thread-transition'
import type { Author, RoomMessage } from '#/features/rooms/types'
import { useRooms } from '#/features/rooms/use-rooms'
import { ActiveAgents } from '#/features/runs/active-agents'
import { RunActivityRail } from '#/features/runs/run-activity-rail'
import { SchedulesPage } from '#/features/schedules/schedules-page'
import { WorkspaceSettingsPage } from '#/features/workspace/workspace-settings'
import { VmsPage } from '#/features/vms/vms-page'
import { useMediaQuery } from '#/hooks/use-media-query'
import { useStoredBoolean } from '#/hooks/use-stored-boolean'
import { useWindowKeydown } from '#/hooks/use-window-keydown'
import {
  ArrowDown,
  CalendarClock,
  Cuboid,
  FileText,
  Flame,
  Hash,
  Lock,
  Plus,
  Settings,
  Server,
  StickyNote,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DashboardLocation } from './dashboard-navigation'
import {
  closeSurface,
  historyDirection,
  openActivitySurface,
  openThreadSurface,
  readDashboardLocation,
  writeDashboardLocation,
} from './dashboard-navigation'
import type { DashboardView } from './room-sidebar'
import { RoomSidebar } from './room-sidebar'
import { WindowToolbar, titleBarVars } from './window-toolbar'

const bottomScrollThreshold = 150
const historyTopThreshold = 80

export function Dashboard({
  user,
  onChangeServer,
}: {
  user: Author
  onChangeServer: () => void
}) {
  const {
    rooms,
    room,
    messages,
    runs,
    latestStepByRun,
    liveStepsByRun,
    loading,
    connection,
    error,
    createError,
    select,
    openMessage,
    focusMessageId,
    clearFocusMessage,
    create,
    remove,
    send,
    sendReply,
    edit,
    threadReplies,
    cancel,
    draft,
    setDraft,
    membersChangedAt,
    mentionableAccounts,
    loadOlder,
    loadingOlder,
    hasOlderMessages,
    notificationByRoom,
    threadAttentionRootIds,
    clearThreadAttention,
  } = useRooms(user.id)
  const [sidebarOpen, setSidebarOpen] = useStoredBoolean('sidebar.open', true)
  const inlineRail = useMediaQuery('(min-width: 1024px)')
  const threadWidthRef = useRef(localStorage.getItem('thread.width') ?? '26rem')
  const [location, setLocation] = useState<DashboardLocation>(() => {
    const pathIssue = window.location.pathname.match(/^\/issues\/([^/]+)$/)
    if (pathIssue)
      return { view: 'issues', id: decodeURIComponent(pathIssue[1]!) }
    return (
      readDashboardLocation(window.history.state, user.id) ?? { view: 'room' }
    )
  })
  const view = location.view
  const selectedIssueId = view === 'issues' ? location.id : undefined
  const selectedDocId = view === 'docs' ? location.id : undefined
  const selectedGrillId = view === 'grills' ? location.id : undefined
  const selectRef = useRef(select)
  selectRef.current = select

  const applyLocation = (next: DashboardLocation) => {
    setLocation(next)
    if (next.view === 'room' && next.id) select(next.id)
  }
  const navigate = (next: DashboardLocation) => {
    if (next.view === location.view && next.id === location.id) return
    writeDashboardLocation(user.id, next)
    applyLocation(next)
  }
  const openThread = (rootId: string, threadFocusReplyId?: string) => {
    clearThreadAttention(rootId)
    if (
      location.surface?.kind === 'thread' &&
      location.surface.rootId === rootId &&
      location.surface.focusReplyId === threadFocusReplyId
    )
      return
    const next = openThreadSurface(location, rootId, threadFocusReplyId)
    writeDashboardLocation(user.id, next)
    applyLocation(next)
  }
  const openActivity = (runId: string) => {
    if (
      location.surface?.kind === 'activity' &&
      location.surface.runId === runId
    )
      return
    const next = openActivitySurface(location, runId)
    writeDashboardLocation(user.id, next)
    applyLocation(next)
  }
  const closeSideSurface = () => {
    const next = closeSurface(location)
    writeDashboardLocation(user.id, next)
    applyLocation(next)
  }
  const clearThreadFocus = () => {
    if (location.surface?.kind !== 'thread' || !location.surface.focusReplyId)
      return
    const next: DashboardLocation = {
      ...location,
      surface: { kind: 'thread', rootId: location.surface.rootId },
    }
    writeDashboardLocation(user.id, next, true)
    applyLocation(next)
  }
  const [issueCreate, setIssueCreate] = useState<{
    open: boolean
    status?: IssueStatus
  }>({ open: false })
  const [grillStartOpen, setGrillStartOpen] = useState(false)
  const openView = (next: DashboardView) => {
    navigate({
      view: next,
      ...(next === 'room' && room ? { id: room.id } : {}),
    })
  }
  const openDoc = (docId: string) => {
    navigate({ view: 'docs', id: docId })
  }
  const [searchOpen, setSearchOpen] = useState(false)
  const [oneshotOpen, setOneshotOpen] = useState(false)
  const pendingThreadFocusRef = useRef<
    { rootId: string; focusReplyId: string } | undefined
  >(undefined)
  // Session-only, kept per root; never serialized or sent to the server.
  const threadDraftsRef = useRef<ThreadDrafts>(emptyThreadDrafts)
  const [transition, setTransition] = useState<ThreadTransitionState>({
    phase: 'closed',
  })
  const [lastSurfaceTarget, setLastSurfaceTarget] = useState<
    ThreadTransitionSurface | undefined
  >(undefined)
  const [editingMessage, setEditingMessage] = useState<RoomMessage>()
  const composer = useRef<MessageComposerHandle>(null)
  const bulletinsRef = useRef<BulletinsPageHandle>(null)
  const scrollRef = useRef<HTMLElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const followRoomRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)

  useEffect(() => {
    writeDashboardLocation(user.id, location, true)
    if (location.view === 'room' && location.id) selectRef.current(location.id)
    const onPopState = (event: PopStateEvent) => {
      const next = readDashboardLocation(event.state, user.id)
      if (!next) return
      setLocation(next)
      if (next.view === 'room' && next.id) selectRef.current(next.id)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [user.id])

  useWindowKeydown((event) => {
    const direction = historyDirection(event)
    if (!direction) return
    event.preventDefault()
    if (direction < 0) window.history.back()
    else window.history.forward()
  })

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
    const pending = pendingThreadFocusRef.current
    if (!pending || focusMessageId !== pending.rootId) return
    pendingThreadFocusRef.current = undefined
    openThread(pending.rootId, pending.focusReplyId)
  }, [focusMessageId])

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

  // The thread rail and Run Activity rail are one side surface: opening one
  // always exits the other first (see thread-transition.ts), and the target
  // it should show comes from history-backed `location.surface` so app-level
  // Back/Forward restores or closes it without ever stacking both rails.
  const surfaceTarget: ThreadTransitionSurface | undefined =
    location.surface?.kind === 'thread'
      ? { kind: 'thread', rootId: location.surface.rootId }
      : location.surface?.kind === 'activity'
        ? { kind: 'activity', runId: location.surface.runId }
        : undefined
  if (!sameThreadSurface(lastSurfaceTarget, surfaceTarget)) {
    setLastSurfaceTarget(surfaceTarget)
    setTransition((current) => requestThreadSurface(current, surfaceTarget))
  }
  const activeSurface =
    transition.phase === 'closed' ? undefined : transition.surface
  const surfaceExiting = transition.phase === 'exiting'
  const activeRun =
    activeSurface?.kind === 'activity'
      ? runs.find(({ id }) => id === activeSurface.runId)
      : undefined
  const activeRootId =
    activeSurface?.kind === 'thread' ? activeSurface.rootId : undefined
  const activityTriggerMessage = activeRun
    ? messages.find(({ id }) => id === activeRun.triggerMessageId)
    : undefined
  const threadRail =
    activeRootId && room ? (
      <RoomThreadRail
        key={activeRootId}
        roomId={room.id}
        roomName={`${room.name} thread`}
        rootId={activeRootId}
        liveReplies={threadReplies[activeRootId] ?? []}
        runs={runs}
        openRun={openActivity}
        mentionHandles={[
          user.name,
          ...mentionableAccounts.map(
            (account) => account.username ?? account.name,
          ),
        ]}
        mentionableAccounts={mentionableAccounts}
        currentUserId={user.id}
        onClose={closeSideSurface}
        sendReply={sendReply}
        editMessage={edit}
        focusReplyId={
          location.surface?.kind === 'thread'
            ? location.surface.focusReplyId
            : undefined
        }
        onFocusReplyHandled={clearThreadFocus}
        draftText={threadDraft(threadDraftsRef.current, activeRootId)}
        onDraftChange={(text) => {
          threadDraftsRef.current = withThreadDraft(
            threadDraftsRef.current,
            activeRootId,
            text,
          )
        }}
        onDraftSubmitted={() => {
          threadDraftsRef.current = withoutThreadDraft(
            threadDraftsRef.current,
            activeRootId,
          )
        }}
        exiting={surfaceExiting}
        onExited={() => setTransition(finishThreadExit)}
      />
    ) : null

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      style={titleBarVars()}
    >
      <WindowToolbar
        accountId={user.id}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenOneshot={() => setOneshotOpen(true)}
      />
      <MessageSearchCommand
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectIssue={(issue) => navigate({ view: 'issues', id: issue.id })}
        onSelectHit={(hit) => {
          const target = navigationForSearchHit(hit)
          navigate({ view: 'room', id: target.roomId })
          if (target.kind === 'thread') {
            pendingThreadFocusRef.current = {
              rootId: target.rootId,
              focusReplyId: target.focusReplyId,
            }
            openMessage(target.roomId, target.rootId)
          } else {
            openMessage(target.roomId, target.messageId)
          }
        }}
      />
      <OneshotPanel
        open={oneshotOpen}
        onOpenChange={setOneshotOpen}
        onOpenIssue={(id) => navigate({ view: 'issues', id })}
      />
      <RoomSidebar
        rooms={rooms}
        selectedRoomId={room?.id}
        onSelect={(roomId) => {
          navigate({ view: 'room', id: roomId })
        }}
        onCreate={async (name, visibility) => {
          const result = await create(name, visibility)
          if (result?.room) navigate({ view: 'room', id: result.room.id })
          return result
        }}
        onDelete={remove}
        createError={createError}
        notificationByRoom={notificationByRoom}
        onMentionAgent={(agentId) => {
          openView('room')
          requestAnimationFrame(() => composer.current?.mention(agentId))
        }}
        view={view}
        onOpenAccount={() => openView('account')}
        onOpenWorkspace={() => {
          if (user.role === 'admin') openView('workspace')
        }}
        onOpenSchedules={() => openView('schedules')}
        onOpenIssues={() => openView('issues')}
        onOpenBulletins={() => openView('bulletins')}
        onOpenDocs={() => openView('docs')}
        onOpenGrills={() => openView('grills')}
        onOpenVms={() => {
          if (user.role === 'admin') openView('vms')
        }}
        user={user}
      />
      <SidebarInset className="h-[calc(100svh-1rem-var(--titlebar,0px))] overflow-hidden border border-border/70 bg-background">
        {view !== 'account' && (
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            {view === 'grills' && selectedGrillId ? (
              <GrillSessionHeader
                grillId={selectedGrillId}
                onBack={() => navigate({ view: 'grills' })}
              />
            ) : view === 'docs' && selectedDocId ? (
              <DocSessionHeader
                docId={selectedDocId}
                onBack={() => navigate({ view: 'docs' })}
              />
            ) : (
              <>
                {view === 'workspace' ? (
                  <Settings className="size-4 text-muted-foreground" />
                ) : view === 'schedules' ? (
                  <CalendarClock className="size-4 text-muted-foreground" />
                ) : view === 'issues' ? (
                  <Cuboid className="size-4 text-muted-foreground" />
                ) : view === 'bulletins' ? (
                  <StickyNote className="size-4 text-muted-foreground" />
                ) : view === 'docs' ? (
                  <FileText className="size-4 text-muted-foreground" />
                ) : view === 'grills' ? (
                  <Flame className="size-4 text-muted-foreground" />
                ) : view === 'vms' ? (
                  <Server className="size-4 text-muted-foreground" />
                ) : room?.visibility === 'private' ? (
                  <Lock className="size-4 text-muted-foreground" />
                ) : (
                  <Hash className="size-4 text-muted-foreground" />
                )}
                <p className="font-semibold">
                  {view === 'workspace'
                    ? 'Workspace'
                    : view === 'schedules'
                      ? 'Schedules'
                      : view === 'issues'
                        ? 'Issues'
                        : view === 'bulletins'
                          ? 'Bulletin board'
                          : view === 'docs'
                            ? 'Docs'
                            : view === 'grills'
                              ? 'Grills'
                              : view === 'vms'
                                ? 'Machines'
                                : (room?.name ?? 'Rooms')}
                </p>
                {view === 'room' && room?.visibility === 'private' && (
                  <MembersPanel
                    room={room}
                    currentUserId={user.id}
                    membersChangedAt={membersChangedAt}
                  />
                )}
                {view === 'issues' && (
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setIssueCreate({ open: true })}
                  >
                    <Plus data-icon="inline-start" />
                    New issue
                  </Button>
                )}
                {view === 'bulletins' && (
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto"
                    onClick={() => bulletinsRef.current?.addBulletin()}
                  >
                    <Plus data-icon="inline-start" />
                    Add bulletin
                  </Button>
                )}
                {view === 'grills' && (
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setGrillStartOpen(true)}
                  >
                    <Plus data-icon="inline-start" />
                    Enter the Grill
                  </Button>
                )}
                {view === 'room' && (
                  <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    {connection === 'connected' ? (
                      <Wifi className="size-3.5" />
                    ) : (
                      <WifiOff className="size-3.5" />
                    )}
                    {connection}
                  </span>
                )}
              </>
            )}
          </header>
        )}
        {view === 'account' && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AccountSettingsPage user={user} onChangeServer={onChangeServer} />
          </div>
        )}
        {view === 'workspace' && user.role === 'admin' && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <WorkspaceSettingsPage currentUserId={user.id} />
          </div>
        )}
        {view === 'schedules' && <SchedulesPage />}
        {view === 'issues' && (
          <IssuesPage
            createOpen={issueCreate.open}
            createStatus={issueCreate.status}
            onCreateOpenChange={(open: boolean, status?: IssueStatus) =>
              setIssueCreate(open ? { open: true, status } : { open: false })
            }
            selectedId={selectedIssueId}
            onSelectedIdChange={(id) =>
              navigate({ view: 'issues', ...(id ? { id } : {}) })
            }
          />
        )}
        {view === 'bulletins' && (
          <BulletinsPage ref={bulletinsRef} currentUserId={user.id} />
        )}
        {view === 'docs' && (
          <div className="min-h-0 flex-1 overflow-hidden animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out fill-mode-backwards motion-reduce:animate-none">
            <DocsPage
              selectedId={selectedDocId}
              onSelectedIdChange={(id) =>
                navigate({ view: 'docs', ...(id ? { id } : {}) })
              }
            />
          </div>
        )}
        {view === 'grills' && (
          <div className="min-h-0 flex-1 overflow-hidden animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out fill-mode-backwards motion-reduce:animate-none">
            <GrillsPage
              startOpen={grillStartOpen}
              onStartOpenChange={setGrillStartOpen}
              selectedId={selectedGrillId}
              onSelectedIdChange={(id) =>
                navigate({ view: 'grills', ...(id ? { id } : {}) })
              }
              onOpenDoc={openDoc}
            />
          </div>
        )}
        {view === 'vms' && user.role === 'admin' && <VmsPage />}
        {view === 'room' && (
          <div className="flex min-h-0 flex-1">
            <ResizablePanelGroup className="min-h-0 min-w-0 flex-1">
              <ResizablePanel className="min-h-0" id="room" minSize="20rem">
                <div
                  className="relative flex h-full min-h-0 min-w-0 flex-col"
                  onPointerDown={() => {
                    if (activeRootId || activeSurface?.kind === 'activity')
                      closeSideSurface()
                  }}
                >
                  <div className="relative min-h-0 flex-1">
                    <section
                      key={room?.id}
                      ref={scrollRef}
                      className="no-scrollbar flex h-full flex-col-reverse overflow-y-auto px-5 py-8 sm:px-8"
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
                          el.scrollHeight -
                            el.clientHeight -
                            Math.abs(el.scrollTop) <=
                            historyTopThreshold &&
                          hasOlderMessages &&
                          !loadingOlder
                        )
                          void loadOlder()
                        const nextAtBottom =
                          Math.abs(el.scrollTop) < bottomScrollThreshold
                        atBottomRef.current = nextAtBottom
                        setAtBottom(nextAtBottom)
                      }}
                    >
                      <div
                        ref={timelineRef}
                        className="mx-auto w-full max-w-7xl shrink-0"
                      >
                        {loadingOlder && (
                          <div
                            className="flex justify-center pb-4 text-sm text-muted-foreground"
                            role="status"
                          >
                            <BrailleLoader text="Loading older messages…" />
                          </div>
                        )}
                        {loading ? (
                          <div
                            className="flex justify-center py-12 text-sm text-muted-foreground"
                            role="status"
                          >
                            <BrailleLoader text="Loading room…" />
                          </div>
                        ) : (
                          <div className="room-fade-in">
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
                              onOpenThread={(nextRootId) =>
                                openThread(nextRootId)
                              }
                              mentionHandles={[
                                user.name,
                                ...mentionableAccounts.map(
                                  (account) => account.username ?? account.name,
                                ),
                              ]}
                            />
                          </div>
                        )}
                      </div>
                    </section>
                    <Button
                      type="button"
                      size="sm"
                      aria-hidden={atBottom}
                      tabIndex={atBottom ? -1 : 0}
                      data-visible={!atBottom}
                      className="scroll-to-bottom-button absolute right-5 bottom-4 rounded-sm shadow-md sm:right-8"
                      onClick={() => {
                        const el = scrollRef.current
                        el?.scrollTo({
                          top: 0,
                          behavior: 'smooth',
                        })
                      }}
                    >
                      To the bottom
                      <ArrowDown data-icon="inline-end" />
                    </Button>
                  </div>
                  <div className="shrink-0 px-4 pb-4 sm:px-6">
                    <div className="mx-auto max-w-7xl rounded-xl border bg-background p-2.5 shadow-sm">
                      <MessageComposer
                        key={room?.id}
                        ref={composer}
                        value={draft}
                        onChange={setDraft}
                        onSubmit={submit}
                        disabled={loading || !room}
                        roomName={room?.name ?? 'room'}
                        mentionableAccounts={mentionableAccounts}
                        editing={Boolean(editingMessage)}
                        onCancelEdit={cancelEdit}
                      />
                    </div>
                    <div className="mx-auto max-w-7xl">
                      <ActiveAgents
                        runs={runs}
                        latestStepByRun={latestStepByRun}
                        cancel={(runId) => void cancel(runId)}
                        openRun={openActivity}
                      />
                    </div>
                    {error && (
                      <p
                        className="mx-auto mt-2 max-w-5xl text-sm text-destructive"
                        role="alert"
                      >
                        {error}
                      </p>
                    )}
                  </div>
                </div>
              </ResizablePanel>
              {inlineRail && threadRail ? (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    className="min-h-0"
                    defaultSize={threadWidthRef.current}
                    groupResizeBehavior="preserve-pixel-size"
                    id="thread"
                    maxSize="40rem"
                    minSize="20rem"
                    onResize={(size, _id, prev) => {
                      if (prev == null) return
                      const next = `${Math.round(size.inPixels)}px`
                      threadWidthRef.current = next
                      localStorage.setItem('thread.width', next)
                    }}
                  >
                    {threadRail}
                  </ResizablePanel>
                </>
              ) : null}
            </ResizablePanelGroup>
            {activeSurface?.kind === 'activity' && activeRun && (
              <RunActivityRail
                key={activeRun.id}
                run={activeRun}
                triggerMessage={activityTriggerMessage}
                liveSteps={liveStepsByRun.get(activeRun.id) ?? []}
                onClose={closeSideSurface}
                onCancel={() => void cancel(activeRun.id)}
                exiting={surfaceExiting}
                onExited={() => setTransition(finishThreadExit)}
              />
            )}
            {!inlineRail && threadRail}
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
