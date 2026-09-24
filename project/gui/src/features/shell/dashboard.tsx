import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import type { IssueStatus } from '#/features/issues/types'
import { MembersPanel } from '#/features/members/members-panel'
import { OneshotPanel } from '#/features/oneshot/oneshot-panel'
import type { MessageComposerHandle } from '#/features/rooms/message-composer'
import { MessageSearchCommand } from '#/features/rooms/message-search-command'
import { navigationForSearchHit } from '#/features/rooms/message-search-navigation'
import type { Author } from '#/features/rooms/types'
import { useRooms } from '#/features/rooms/use-rooms'
import { MachineSessionHeader } from '#/features/vms/components/machine-session'
import { useStoredBoolean } from '#/hooks/use-stored-boolean'
import { useWindowKeydown } from '#/hooks/use-window-keydown'
import { cn } from '#/lib/utils'
import { Box, CalendarClock, Hash, Lock, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DashboardView } from './dashboard-navigation'
import { historyDirection } from './dashboard-navigation'
import { DashboardPages } from './dashboard-pages'
import { useDashboardStore } from './dashboard-store'
import { RoomSidebar } from './room-sidebar'
import { RoomView } from './room-view'
import { WindowToolbar, titleBarVars } from './window-toolbar'

export function Dashboard({
  user,
  onChangeServer,
}: {
  user: Author
  onChangeServer: () => void
}) {
  const [sidebarOpen, setSidebarOpen] = useStoredBoolean('sidebar.open', true)
  const accountId = useDashboardStore((state) => state.accountId)
  const location = useDashboardStore((state) => state.location)
  const ready = accountId === user.id
  const { navigate, openWorkspaceActivity, applyFromHistory, bootstrap } =
    useDashboardStore.getState()
  const view = location.view
  const {
    rooms,
    room,
    messages,
    runs,
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
    cancel,
    draft,
    setDraft,
    membersChangedAt,
    mentionableAccounts,
    loadOlder,
    loadingOlder,
    notificationByRoom,
    threadAttentionRootIds,
    clearThreadAttention,
  } = useRooms(user.id, ready && view === 'room')
  const selectedIssueId = view === 'issues' ? location.id : undefined
  const selectedMachineId = view === 'vms' ? location.id : undefined
  const selectedChatId = view === 'chat' ? location.id : undefined
  const selectedScheduleId = view === 'schedules' ? location.id : undefined
  const activityRunId =
    location.surface?.kind === 'activity' ? location.surface.runId : undefined
  const selectRef = useRef(select)
  selectRef.current = select
  const [issueCreate, setIssueCreate] = useState<{
    open: boolean
    status?: IssueStatus
  }>({ open: false })
  const openView = (next: DashboardView) => {
    navigate({
      view: next,
      ...(next === 'room' && room ? { id: room.id } : {}),
    })
  }
  const openMachine =
    user.role === 'admin'
      ? (sandboxId: string) => navigate({ view: 'vms', id: sandboxId })
      : undefined
  const [searchOpen, setSearchOpen] = useState(false)
  const [oneshotOpen, setOneshotOpen] = useState(false)
  const composer = useRef<MessageComposerHandle>(null)

  useLayoutEffect(() => {
    bootstrap(user.id)
    return () =>
      useDashboardStore.setState(useDashboardStore.getInitialState(), true)
  }, [bootstrap, user.id])

  useEffect(() => {
    if (ready && location.view === 'room' && location.id)
      selectRef.current(location.id)
  }, [ready, location.view, location.id])

  useEffect(() => {
    const surface = location.surface
    if (
      ready &&
      view === 'room' &&
      (!location.id || location.id === room?.id) &&
      surface?.kind === 'thread' &&
      threadAttentionRootIds.includes(surface.rootId)
    )
      clearThreadAttention(surface.rootId)
  }, [
    ready,
    view,
    location.id,
    location.surface,
    room?.id,
    threadAttentionRootIds,
    clearThreadAttention,
  ])

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => applyFromHistory(event.state)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [applyFromHistory])

  useWindowKeydown((event) => {
    const direction = historyDirection(event)
    if (!direction) return
    event.preventDefault()
    if (direction < 0) window.history.back()
    else window.history.forward()
  })

  if (!ready) return null

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
        onOpenActivity={openWorkspaceActivity}
      />
      <MessageSearchCommand
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectIssue={(issue) => navigate({ view: 'issues', id: issue.id })}
        onSelectHit={(hit) => {
          const target = navigationForSearchHit(hit)
          navigate({ view: 'room', id: target.roomId })
          if (target.kind === 'thread') {
            useDashboardStore.setState({
              pendingThreadFocus: {
                rootId: target.rootId,
                focusReplyId: target.focusReplyId,
              },
            })
            openMessage(target.roomId, target.rootId)
          } else {
            useDashboardStore.setState({ pendingThreadFocus: undefined })
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
        onOpenAgents={() => openView('agents')}
        onOpenIssues={() => openView('issues')}
        onOpenBulletins={() => openView('bulletins')}
        onOpenChat={() => openView('chat')}
        onOpenVms={() => {
          if (user.role === 'admin') openView('vms')
        }}
        user={user}
      />
      <SidebarInset
        className={cn(
          'h-[calc(100svh-1rem-var(--titlebar,0px))] overflow-hidden border border-border/70 bg-background',
          view === 'room' && 'room-surface',
        )}
      >
        {view !== 'account' &&
          view !== 'workspace' &&
          view !== 'chat' &&
          view !== 'agents' &&
          view !== 'issues' &&
          view !== 'bulletins' && (
            <header
              className={cn(
                'flex h-14 shrink-0 items-center gap-2 border-b',
                view === 'room' ? 'room-header' : 'px-4',
              )}
            >
              {view === 'vms' && selectedMachineId ? (
                <MachineSessionHeader
                  machineId={selectedMachineId}
                  onBack={() => navigate({ view: 'vms' })}
                />
              ) : (
                <>
                  {view === 'schedules' ? (
                    <CalendarClock className="size-4 text-muted-foreground" />
                  ) : view === 'vms' ? (
                    <Box className="size-4 text-muted-foreground" />
                  ) : room?.visibility === 'private' ? (
                    <Lock className="size-4 text-muted-foreground" />
                  ) : (
                    <Hash className="size-4 text-muted-foreground" />
                  )}
                  <p
                    className={view === 'room' ? 'room-title' : 'font-semibold'}
                  >
                    {view === 'schedules'
                      ? 'Schedules'
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
        {view === 'room' ? (
          <RoomView
            user={user}
            room={room}
            messages={messages}
            runs={runs}
            loading={loading}
            error={error}
            draft={draft}
            setDraft={setDraft}
            send={send}
            sendReply={sendReply}
            edit={edit}
            cancel={cancel}
            mentionableAccounts={mentionableAccounts}
            loadOlder={loadOlder}
            loadingOlder={loadingOlder}
            threadAttentionRootIds={threadAttentionRootIds}
            focusMessageId={focusMessageId}
            clearFocusMessage={clearFocusMessage}
            composer={composer}
            openMachine={openMachine}
          />
        ) : (
          <DashboardPages
            view={view}
            user={user}
            onChangeServer={onChangeServer}
            issueCreate={issueCreate}
            onIssueCreateChange={(open, status) =>
              setIssueCreate(open ? { open: true, status } : { open: false })
            }
            selectedIssueId={selectedIssueId}
            onSelectedIssueIdChange={(id) =>
              navigate({ view: 'issues', ...(id ? { id } : {}) })
            }
            activityRunId={activityRunId}
            selectedScheduleId={selectedScheduleId}
            onSelectedScheduleIdChange={(id) =>
              navigate({ view: 'schedules', ...(id ? { id } : {}) })
            }
            selectedMachineId={selectedMachineId}
            onSelectedMachineIdChange={(id) =>
              navigate({ view: 'vms', ...(id ? { id } : {}) })
            }
            selectedChatId={selectedChatId}
            onSelectedChatIdChange={(id) =>
              navigate({ view: 'chat', ...(id ? { id } : {}) })
            }
            onOpenMachine={openMachine}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
