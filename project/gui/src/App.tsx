import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import {
  Bot,
  Hash,
  Lock,
  LogOut,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import { RunActivityRail } from '#/features/runs/run-activity-rail'
import { ActiveAgents } from '#/features/runs/active-agents'
import { MessageComposer } from '#/features/rooms/message-composer'
import type { MessageComposerHandle } from '#/features/rooms/message-composer'
import { ModeToggle } from '#/components/mode-toggle'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '#/components/ui/popover'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '#/components/ui/sidebar'
import type { Author } from '#/features/rooms/types'
import { useRooms } from '#/features/rooms/use-rooms'
import { Avatar } from '#/components/avatar'
import { MembersPanel } from '#/features/members/members-panel'
import { Timeline } from '#/features/rooms/room-timeline'

function Dashboard({ user }: { user: Author }) {
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
    send,
    cancel,
    draft,
    setDraft,
    membersChangedAt,
  } = useRooms()
  const [creating, setCreating] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [roomVisibility, setRoomVisibility] = useState<'public' | 'private'>('public')
  const [creatingRoom, setCreatingRoom] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string>()
  const roomNameInput = useRef<HTMLInputElement>(null)
  const composer = useRef<MessageComposerHandle>(null)
  const scrollRef = useRef<HTMLElement>(null)
  const atBottomRef = useRef(true)
  const submit = async (text: string) => {
    if (!text.trim()) return
    const result = await send(text)
    if (result) setDraft('')
  }
  const submitRoom = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!roomName.trim()) return
    setCreatingRoom(true)
    const result = await create(roomName.trim(), roomVisibility)
    setCreatingRoom(false)
    if (result) {
      setRoomName('')
      setRoomVisibility('public')
      setCreating(false)
    }
  }
  const cancelRoom = () => {
    setRoomName('')
    setRoomVisibility('public')
    setCreating(false)
  }

  useEffect(() => {
    if (creating) roomNameInput.current?.focus()
  }, [creating])

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
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarContent>
          <SidebarGroup>
            <div className="flex items-center justify-between pr-2">
              <SidebarGroupLabel>Rooms</SidebarGroupLabel>
              <Popover
                open={creating}
                onOpenChange={(open) => {
                  if (open) setCreating(true)
                  else cancelRoom()
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    aria-label="Create room"
                  >
                    +
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="right" align="start">
                  <PopoverHeader>
                    <PopoverTitle>Create room</PopoverTitle>
                  </PopoverHeader>
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(event) => void submitRoom(event)}
                  >
                    <input
                      ref={roomNameInput}
                      value={roomName}
                      onChange={(event) => setRoomName(event.target.value)}
                      className="w-full rounded border bg-background px-2 py-1 text-sm"
                      aria-label="Room name"
                      placeholder="Room name"
                      disabled={creatingRoom}
                      required
                    />
                    <div className="flex items-center gap-1" role="group" aria-label="Visibility">
                      <button
                        type="button"
                        onClick={() => setRoomVisibility('public')}
                        disabled={creatingRoom}
                        className={`flex-1 rounded border px-2 py-1 text-xs transition-colors ${roomVisibility === 'public' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                      >
                        Public
                      </button>
                      <button
                        type="button"
                        onClick={() => setRoomVisibility('private')}
                        disabled={creatingRoom}
                        className={`flex-1 rounded border px-2 py-1 text-xs transition-colors ${roomVisibility === 'private' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                      >
                        Private
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="submit"
                        size="xs"
                        disabled={creatingRoom || !roomName.trim()}
                      >
                        Create
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={cancelRoom}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                  {creating && createError && (
                    <p className="mt-1 text-xs text-destructive" role="alert">
                      {createError}
                    </p>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            <SidebarGroupContent>
              <SidebarMenu>
                {rooms.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={item.id === room?.id}
                      tooltip={item.name}
                      onClick={() => select(item.id)}
                      className="data-[active=true]:bg-primary/5"
                    >
                      {item.visibility === 'private' ? <Lock /> : <Hash />}
                      <span>{item.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Agents</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Software engineer"
                    onClick={() =>
                      composer.current?.mention('software-engineer')
                    }
                  >
                    <Bot />
                    <span>Software engineer</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center gap-2 py-2">
            <Avatar author={user} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {user.name}
            </span>
            <ModeToggle />
            <Button
              aria-label="Sign out"
              variant="outline"
              size="icon-sm"
              onClick={() => void authClient.signOut()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="h-[calc(100svh-1rem)] overflow-hidden border border-border/70 bg-background">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          {room?.visibility === 'private' ? (
            <Lock className="size-4 text-muted-foreground" />
          ) : (
            <Hash className="size-4 text-muted-foreground" />
          )}
          <h1 className="font-semibold">{room?.name ?? 'Rooms'}</h1>
          {room?.visibility === 'private' && (
            <MembersPanel
              room={room}
              currentUserId={user.id}
              membersChangedAt={membersChangedAt}
            />
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            {connection === 'connected' ? (
              <Wifi className="size-3.5" />
            ) : (
              <WifiOff className="size-3.5" />
            )}
            {connection}
          </span>
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <section
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-5 py-8 sm:px-8"
              aria-busy={loading}
              onScroll={() => {
                const el = scrollRef.current
                if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150
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
      </SidebarInset>
    </SidebarProvider>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [signingUp, setSigningUp] = useState(false)
  const [error, setError] = useState<string>()
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const result = signingUp
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password })
      setError(result.error?.message)
    } catch {
      setError('Unable to reach Sweat. Check that the coordinator is running.')
    }
  }
  return (
    <main className="mx-auto max-w-sm p-8">
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <h1 className="text-2xl font-semibold">
          {signingUp ? 'Create account' : 'Sign in'}
        </h1>
        {signingUp && (
          <input
            className="h-9 w-full rounded-md border bg-background px-3"
            placeholder="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        )}
        <input
          className="h-9 w-full rounded-md border bg-background px-3"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="h-9 w-full rounded-md border bg-background px-3"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" type="submit">
          {signingUp ? 'Sign up' : 'Sign in'}
        </Button>
        <Button
          className="w-full"
          variant="link"
          type="button"
          onClick={() => setSigningUp((value) => !value)}
        >
          {signingUp ? 'Have an account? Sign in' : 'Need an account? Sign up'}
        </Button>
      </form>
    </main>
  )
}

export function App() {
  const { data: session, isPending } = authClient.useSession()
  if (isPending) return null
  return session?.user ? (
    <Dashboard
      user={{
        id: session.user.id,
        name: session.user.name,
        image: session.user.image ?? undefined,
      }}
    />
  ) : (
    <SignIn />
  )
}
