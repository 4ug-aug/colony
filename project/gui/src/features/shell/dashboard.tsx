import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { AccountSettingsPage } from '#/features/account/account-settings'
import { IssuesPage } from '#/features/issues/issues-page'
import type { IssueStatus } from '#/features/issues/types'
import { BulletinsPage } from '#/features/bulletins/bulletins-page'
import type { BulletinsPageHandle } from '#/features/bulletins/bulletins-page'
import { DocsPage, DocSessionHeader } from '#/features/docs/docs-page'
import { GrillsPage, GrillSessionHeader } from '#/features/grills/grills-page'
import { MembersPanel } from '#/features/members/members-panel'
import type { MessageComposerHandle } from '#/features/rooms/message-composer'
import { MessageComposer } from '#/features/rooms/message-composer'
import { MessageSearchCommand } from '#/features/rooms/message-search-command'
import { Timeline } from '#/features/rooms/room-timeline'
import type { Author, RoomMessage } from '#/features/rooms/types'
import { useRooms } from '#/features/rooms/use-rooms'
import { ActiveAgents } from '#/features/runs/active-agents'
import { RunActivityRail } from '#/features/runs/run-activity-rail'
import { SchedulesPage } from '#/features/schedules/schedules-page'
import { WorkspaceSettingsPage } from '#/features/workspace/workspace-settings'
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
  StickyNote,
  UserRound,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  historyDirection,
  readDashboardLocation,
  writeDashboardLocation,
} from './dashboard-navigation'
import type { DashboardLocation } from './dashboard-navigation'
import type { DashboardView } from './room-sidebar'
import { RoomSidebar } from './room-sidebar'
import { WindowToolbar, titleBarVars } from './window-toolbar'
import { Kbd } from '#/components/ui/kbd'

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
    edit,
    cancel,
    draft,
    setDraft,
    membersChangedAt,
    mentionableAccounts,
    loadOlder,
    loadingOlder,
    hasOlderMessages,
    notificationByRoom,
  } = useRooms(user.id)
  const [sidebarOpen, setSidebarOpen] = useStoredBoolean('sidebar.open', true)
  const [location, setLocation] = useState<DashboardLocation>(
    () =>
      readDashboardLocation(window.history.state, user.id) ?? { view: 'room' },
  )
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
  const [selectedRunId, setSelectedRunId] = useState<string>()
  const [editingMessage, setEditingMessage] = useState<RoomMessage>()
  const composer = useRef<MessageComposerHandle>(null)
  const bulletinsRef = useRef<BulletinsPageHandle>(null)
  const scrollRef = useRef<HTMLElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const followRoomRef = useRef(true)
  const historyAnchorRef = useRef<{ height: number; top: number } | undefined>(
    undefined,
  )
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
  }, [room?.id])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || loading || (!followRoomRef.current && !atBottomRef.current))
      return
    el.scrollTop = el.scrollHeight
    atBottomRef.current = true
    setAtBottom(true)
  }, [loading, messages, room?.id, runs])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const timeline = timelineRef.current
    if (!el || !timeline) return
    const observer = new ResizeObserver(() => {
      if (followRoomRef.current || atBottomRef.current)
        el.scrollTop = el.scrollHeight
    })
    observer.observe(timeline)
    return () => observer.disconnect()
  }, [room?.id])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const anchor = historyAnchorRef.current
    if (!el || !anchor) return
    el.scrollTop = anchor.top + el.scrollHeight - anchor.height
    historyAnchorRef.current = undefined
  }, [messages])

  useLayoutEffect(() => {
    historyAnchorRef.current = undefined
    setSelectedRunId(undefined)
    setEditingMessage(undefined)
  }, [room?.id])

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

  const selectedRun = runs.find(({ id }) => id === selectedRunId)
  const triggerMessage = selectedRun
    ? messages.find(({ id }) => id === selectedRun.triggerMessageId)
    : undefined

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      style={titleBarVars()}
    >
      <WindowToolbar
        accountId={user.id}
        onOpenSearch={() => setSearchOpen(true)}
      />
      <MessageSearchCommand
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectHit={(hit) => {
          navigate({ view: 'room', id: hit.roomId })
          openMessage(hit.roomId, hit.messageId)
        }}
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
        user={user}
      />
      <SidebarInset className="h-[calc(100svh-1rem-var(--titlebar,0px))] overflow-hidden border border-border/70 bg-background">
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
              {view === 'account' ? (
                <UserRound className="size-4 text-muted-foreground" />
              ) : view === 'workspace' ? (
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
              ) : room?.visibility === 'private' ? (
                <Lock className="size-4 text-muted-foreground" />
              ) : (
                <Hash className="size-4 text-muted-foreground" />
              )}
              <p className="font-semibold">
                {view === 'account'
                  ? 'User settings'
                  : view === 'workspace'
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
          <div className="min-h-0 flex-1 overflow-hidden">
            <DocsPage
              selectedId={selectedDocId}
              onSelectedIdChange={(id) =>
                navigate({ view: 'docs', ...(id ? { id } : {}) })
              }
            />
          </div>
        )}
        {view === 'grills' && (
          <div className="min-h-0 flex-1 overflow-hidden">
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
        {view === 'room' && (
          <div className="flex min-h-0 flex-1">
            <div className="relative flex min-w-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1">
                <section
                  key={room?.id}
                  ref={scrollRef}
                  className="no-scrollbar h-full overflow-y-auto px-5 py-8 sm:px-8"
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
                    if (el) {
                      if (
                        el.scrollTop <= historyTopThreshold &&
                        hasOlderMessages &&
                        !loadingOlder
                      ) {
                        historyAnchorRef.current = {
                          height: el.scrollHeight,
                          top: el.scrollTop,
                        }
                        void loadOlder()
                      }
                      const nextAtBottom =
                        el.scrollHeight - el.scrollTop - el.clientHeight <
                        bottomScrollThreshold
                      atBottomRef.current = nextAtBottom
                      setAtBottom(nextAtBottom)
                    }
                  }}
                >
                  <div ref={timelineRef} className="mx-auto max-w-7xl">
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
                      <Timeline
                        messages={messages}
                        runs={runs}
                        openRun={setSelectedRunId}
                        currentUserId={user.id}
                        focusMessageId={focusMessageId}
                        onFocusHandled={clearFocusMessage}
                        onEdit={(message) => {
                          setEditingMessage(message)
                          setDraft(message.text)
                        }}
                        mentionHandles={[
                          user.name,
                          ...mentionableAccounts.map(
                            (account) => account.username ?? account.name,
                          ),
                        ]}
                      />
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
                      top: el.scrollHeight,
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
                    openRun={setSelectedRunId}
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
            {selectedRun && (
              <RunActivityRail
                key={selectedRun.id}
                run={selectedRun}
                triggerMessage={triggerMessage}
                liveSteps={liveStepsByRun.get(selectedRun.id) ?? []}
                onClose={() => setSelectedRunId(undefined)}
                onCancel={() => void cancel(selectedRun.id)}
              />
            )}
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
