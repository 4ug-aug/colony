import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  Hash,
  Lock,
  Settings,
  UserRound,
  Wifi,
  WifiOff,
} from 'lucide-react'
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
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'

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
    create,
    remove,
    send,
    cancel,
    draft,
    setDraft,
    membersChangedAt,
    mentionableAccounts,
    loadOlder,
    loadingOlder,
    hasOlderMessages,
  } = useRooms()
  const [view, setView] = useState<DashboardView>('room')
  const [selectedRunId, setSelectedRunId] = useState<string>()
  const composer = useRef<MessageComposerHandle>(null)
  const scrollRef = useRef<HTMLElement>(null)
  const atBottomRef = useRef(true)
  const historyAnchorRef = useRef<
    { height: number; top: number } | undefined
  >(undefined)
  const [atBottom, setAtBottom] = useState(true)

  const submit = async (text: string, files: File[]) => {
    if (!text.trim() && !files.length) return false
    const result = await send(text, files)
    if (result) setDraft('')
    return Boolean(result)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages, runs])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const anchor = historyAnchorRef.current
    if (!el || !anchor) return
    el.scrollTop = anchor.top + el.scrollHeight - anchor.height
    historyAnchorRef.current = undefined
  }, [messages])

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
      atBottomRef.current = true
      setAtBottom(true)
      historyAnchorRef.current = undefined
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
            <AccountSettingsPage user={user} onChangeServer={onChangeServer} />
          </div>
        )}
        {view === 'workspace' && user.role === 'admin' && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <WorkspaceSettingsPage currentUserId={user.id} />
          </div>
        )}
        {view === 'room' && (
          <div className="flex min-h-0 flex-1">
            <div className="relative flex min-w-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1">
                <section
                  ref={scrollRef}
                  className="h-full overflow-y-auto px-5 py-8 sm:px-8"
                  aria-busy={loading}
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
                  <div className="mx-auto max-w-7xl">
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
                  variant="outline"
                  size="sm"
                  aria-hidden={atBottom}
                  tabIndex={atBottom ? -1 : 0}
                  data-visible={!atBottom}
                  className="scroll-to-bottom-button absolute right-5 bottom-4 rounded-sm bg-background/95 shadow-md sm:right-8"
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
