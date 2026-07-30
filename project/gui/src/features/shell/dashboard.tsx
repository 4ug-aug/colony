import { useEffect, useRef, useState } from 'react'
import { Hash, Lock, Settings, UserRound, Wifi, WifiOff } from 'lucide-react'
import { useRooms } from '#/features/rooms/use-rooms'
import { RoomSidebar } from './room-sidebar'
import type { DashboardView } from './room-sidebar'
import { Timeline } from '#/features/rooms/room-timeline'
import { MessageComposer } from '#/features/rooms/message-composer'
import type { MessageComposerHandle } from '#/features/rooms/message-composer'
import { MembersPanel } from '#/features/members/members-panel'
import { ActiveAgents } from '#/features/runs/active-agents'
import { RunActivityRail } from '#/features/runs/run-activity-rail'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import type { Author } from '#/features/rooms/types'
import { AccountSettingsPage } from '#/features/account/account-settings'
import { WorkspaceSettingsPage } from '#/features/workspace/workspace-settings'
import { WindowToolbar, titleBarVars } from './window-toolbar'

export function Dashboard({ user }: { user: Author }) {
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
    create,
    remove,
    send,
    cancel,
    draft,
    setDraft,
    membersChangedAt,
    mentionableAccounts,
  } = useRooms()
  const [view, setView] = useState<DashboardView>('room')
  const [selectedRunId, setSelectedRunId] = useState<string>()
  const composer = useRef<MessageComposerHandle>(null)
  const scrollRef = useRef<HTMLElement>(null)
  const atBottomRef = useRef(true)

  const submit = async (text: string) => {
    if (!text.trim()) return
    const result = await send(text)
    if (result) setDraft('')
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages, runs])

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
      atBottomRef.current = true
    }
    setSelectedRunId(undefined)
  }, [room?.id])

  const selectedRun = runs.find(({ id }) => id === selectedRunId)
  const triggerMessage = selectedRun
    ? messages.find(({ id }) => id === selectedRun.triggerMessageId)
    : undefined

  return (
    <SidebarProvider style={titleBarVars()}>
      <WindowToolbar />
      <RoomSidebar
        rooms={rooms}
        selectedRoomId={room?.id}
        onSelect={(roomId) => {
          setView('room')
          select(roomId)
        }}
        onCreate={async (name, visibility) => {
          const result = await create(name, visibility)
          if (result) setView('room')
          return result
        }}
        onDelete={remove}
        createError={createError}
        onMentionAgent={(agentId) => {
          setView('room')
          requestAnimationFrame(() => composer.current?.mention(agentId))
        }}
        view={view}
        onOpenAccount={() => setView('account')}
        onOpenWorkspace={() => {
          if (user.role === 'admin') setView('workspace')
        }}
        user={user}
      />
      <SidebarInset className="h-[calc(100svh-1rem-var(--titlebar,0px))] overflow-hidden border border-border/70 bg-background">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          {view === 'account' ? (
            <UserRound className="size-4 text-muted-foreground" />
          ) : view === 'workspace' ? (
            <Settings className="size-4 text-muted-foreground" />
          ) : room?.visibility === 'private' ? (
            <Lock className="size-4 text-muted-foreground" />
          ) : (
            <Hash className="size-4 text-muted-foreground" />
          )}
          <h1 className="font-semibold">
            {view === 'account'
              ? 'User settings'
              : view === 'workspace'
                ? 'Workspace'
                : (room?.name ?? 'Rooms')}
          </h1>
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
        </header>
        {view === 'account' && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AccountSettingsPage user={user} />
          </div>
        )}
        {view === 'workspace' && user.role === 'admin' && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <WorkspaceSettingsPage currentUserId={user.id} />
          </div>
        )}
        {view === 'room' && (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <section
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-5 py-8 sm:px-8"
                aria-busy={loading}
                onScroll={() => {
                  const el = scrollRef.current
                  if (el)
                    atBottomRef.current =
                      el.scrollHeight - el.scrollTop - el.clientHeight < 150
                }}
              >
                <div className="mx-auto max-w-7xl">
                  {loading ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      Loading room…
                    </p>
                  ) : (
                    <Timeline
                      messages={messages}
                      runs={runs}
                      openRun={setSelectedRunId}
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
              <div className="shrink-0 px-4 pb-4 sm:px-6">
                <div className="mx-auto max-w-7xl rounded-xl border bg-background p-2.5 shadow-sm">
                  <MessageComposer
                    ref={composer}
                    value={draft}
                    onChange={setDraft}
                    onSubmit={(text) => void submit(text)}
                    disabled={loading || !room}
                    roomName={room?.name ?? 'room'}
                    mentionableAccounts={mentionableAccounts}
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
