import { useEffect, useMemo, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import {
  Bot,
  Check,
  CircleX,
  Hash,
  LoaderCircle,
  Lock,
  LogOut,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { authClient, sweatApiUrl } from '#/lib/auth-client'
import { messagesAreGrouped } from '#/features/rooms/message-grouping'
import type { Step } from '#/features/runs/step-label'
import { terminal, agentName, runStatus } from '#/features/runs/run-helpers'
import { Button } from '#/components/ui/button'
import { RunActivityRail } from '#/features/runs/run-activity-rail'
import {
  Avatar as AgentAvatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from '#/components/ui/avatar'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '#/components/ui/hover-card'
import { MessageComposer } from '#/components/message-composer'
import type { MessageComposerHandle } from '#/components/message-composer'
import { Markdown } from '#/components/markdown'
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
import type { Author, Room, RoomMessage, RoomRun } from '#/features/rooms/types'
import { useRooms } from '#/features/rooms/use-rooms'
import { Avatar, timestamp } from '#/components/avatar'

function RunAvatar({ run }: { run: RoomRun }) {
  return (
    <AgentAvatar size="sm" title={agentName(run.agentId)}>
      <AvatarFallback className="bg-primary/10 text-primary">
        <Bot className="size-3" />
      </AvatarFallback>
    </AgentAvatar>
  )
}

function RunCapsule({
  run,
  openRun,
}: {
  run: RoomRun
  openRun: (runId: string) => void
}) {
  const state =
    run.state === 'succeeded'
      ? 'completed'
      : run.state === 'failed'
        ? 'failed'
        : run.state === 'cancelled'
          ? 'cancelled'
          : 'working'
  return (
    <button
      type="button"
      className="mt-2 inline-flex items-center gap-1.5 rounded-full border bg-muted/30 py-1 pl-1 pr-2 text-xs text-muted-foreground hover:bg-muted"
      aria-label={`View ${agentName(run.agentId)} activity, ${state}`}
      onClick={() => openRun(run.id)}
    >
      <AvatarGroup>
        <RunAvatar run={run} />
      </AvatarGroup>
      {run.state === 'succeeded' ? (
        <Check className="size-3.5 text-primary" />
      ) : run.state === 'failed' ? (
        <CircleX className="size-3.5 text-destructive" />
      ) : run.state === 'cancelled' ? (
        <X className="size-3.5" />
      ) : (
        <LoaderCircle className="size-3.5 animate-spin" />
      )}
      <span>1</span>
    </button>
  )
}

function ActiveAgents({
  runs,
  latestStepByRun,
  cancel,
  openRun,
}: {
  runs: RoomRun[]
  latestStepByRun: Map<string, Step>
  cancel: (runId: string) => void
  openRun: (runId: string) => void
}) {
  const activeRuns = runs.filter((run) => !terminal(run.state))
  if (!activeRuns.length) return null

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="mt-2 flex items-center gap-2 rounded-md px-1 py-1 text-sm font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${activeRuns.length} ${activeRuns.length === 1 ? 'agent' : 'agents'} working. View status.`}
        >
          <AvatarGroup>
            {activeRuns.slice(0, 3).map((run) => (
              <RunAvatar key={run.id} run={run} />
            ))}
            {activeRuns.length > 3 && (
              <AvatarGroupCount className="size-6 text-xs">
                +{activeRuns.length - 3}
              </AvatarGroupCount>
            )}
          </AvatarGroup>
          <span>
            {agentName(activeRuns[0].agentId)}
            {activeRuns.length > 1 && ` +${activeRuns.length - 1}`}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" sideOffset={8} className="w-96 p-3">
        <h2 className="px-1 pb-1 text-sm font-semibold">Agents working</h2>
        <div>
          {activeRuns.map((run) => (
            <div key={run.id} className="flex items-center gap-3 rounded-md px-1 py-2">
              <RunAvatar run={run} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{agentName(run.agentId)}</p>
                <p
                  key={runStatus(run, latestStepByRun.get(run.id))}
                  className="truncate text-xs text-muted-foreground"
                >
                  {runStatus(run, latestStepByRun.get(run.id))}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                onClick={() => openRun(run.id)}
              >
                View activity
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Cancel ${agentName(run.agentId)}`}
                onClick={() => cancel(run.id)}
              >
                <X />
              </Button>
              <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}


type MemberUser = { id: string; name: string; image?: string }

function MembersPanel({
  room,
  currentUserId,
  membersChangedAt,
}: {
  room: Room
  currentUserId: string
  membersChangedAt: Record<string, number>
}) {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<MemberUser[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [membersError, setMembersError] = useState<string>()
  const [workspaceUsers, setWorkspaceUsers] = useState<MemberUser[]>([])
  const [loadingWorkspace, setLoadingWorkspace] = useState(false)
  const [workspaceError, setWorkspaceError] = useState<string>()
  const [mutating, setMutating] = useState(false)
  const [mutateError, setMutateError] = useState<string>()

  const fetchMembers = async () => {
    setLoadingMembers(true)
    setMembersError(undefined)
    try {
      const res = await fetch(sweatApiUrl(`/api/rooms/${room.id}/members`), {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Could not load members')
      const data = (await res.json()) as { members: MemberUser[] }
      setMembers(data.members)
    } catch (reason) {
      setMembersError(reason instanceof Error ? reason.message : 'Could not load members')
    } finally {
      setLoadingMembers(false)
    }
  }

  const fetchWorkspaceUsers = async () => {
    setLoadingWorkspace(true)
    setWorkspaceError(undefined)
    try {
      const res = await fetch(sweatApiUrl('/api/workspace/members'), {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Could not load users')
      const data = (await res.json()) as { users: MemberUser[] }
      setWorkspaceUsers(data.users)
    } catch (reason) {
      setWorkspaceError(reason instanceof Error ? reason.message : 'Could not load users')
    } finally {
      setLoadingWorkspace(false)
    }
  }

  // Fetch members when panel opens or when membersChangedAt bumps for this room
  useEffect(() => {
    if (!open) return
    void fetchMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, membersChangedAt[room.id]])

  // Fetch workspace users lazily when panel opens (once)
  useEffect(() => {
    if (!open) return
    void fetchWorkspaceUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleRemove = async (userId: string) => {
    setMutating(true)
    setMutateError(undefined)
    try {
      const res = await fetch(
        sweatApiUrl(`/api/rooms/${room.id}/members/${userId}`),
        { method: 'DELETE', credentials: 'include' },
      )
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Could not remove member')
      }
      await fetchMembers()
    } catch (reason) {
      setMutateError(reason instanceof Error ? reason.message : 'Could not remove member')
    } finally {
      setMutating(false)
    }
  }

  const handleLeave = async () => {
    setMutating(true)
    setMutateError(undefined)
    try {
      const res = await fetch(
        sweatApiUrl(`/api/rooms/${room.id}/members/${currentUserId}`),
        { method: 'DELETE', credentials: 'include' },
      )
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Could not leave room')
      }
      setOpen(false)
    } catch (reason) {
      setMutateError(reason instanceof Error ? reason.message : 'Could not leave room')
      setMutating(false)
    }
  }

  const handleAdd = async (userId: string) => {
    setMutating(true)
    setMutateError(undefined)
    try {
      const res = await fetch(sweatApiUrl(`/api/rooms/${room.id}/members`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Could not add member')
      }
      await Promise.all([fetchMembers(), fetchWorkspaceUsers()])
    } catch (reason) {
      setMutateError(reason instanceof Error ? reason.message : 'Could not add member')
    } finally {
      setMutating(false)
    }
  }

  const isOwner = room.createdBy === currentUserId
  const memberIds = new Set(members.map((m) => m.id))
  const addable = workspaceUsers.filter((u) => !memberIds.has(u.id))

  // Avatar stack: up to 3 member avatars + count
  const stackAvatars = members.slice(0, 3)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-2 flex items-center gap-1 text-muted-foreground"
          aria-label="Members"
        >
          {stackAvatars.length > 0 ? (
            <span className="flex -space-x-1.5">
              {stackAvatars.map((m) =>
                m.image ? (
                  <img
                    key={m.id}
                    src={m.image}
                    alt=""
                    className="size-5 rounded-full border-2 border-background object-cover"
                  />
                ) : (
                  <span
                    key={m.id}
                    className="flex size-5 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-semibold text-muted-foreground"
                  >
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                ),
              )}
            </span>
          ) : (
            <Users className="size-3.5" />
          )}
          {members.length > 0 && (
            <span className="text-xs tabular-nums">{members.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <PopoverHeader className="px-4 pt-4 pb-2">
          <PopoverTitle>Members</PopoverTitle>
        </PopoverHeader>
        <div className="px-4 pb-4 space-y-1">
          {loadingMembers && (
            <p className="py-2 text-xs text-muted-foreground">Loading…</p>
          )}
          {!loadingMembers && membersError && (
            <p className="py-2 text-xs text-destructive" role="alert">{membersError}</p>
          )}
          {!loadingMembers && !membersError && members.map((member) => {
            const isMe = member.id === currentUserId
            return (
              <div key={member.id} className="flex items-center gap-2 rounded-md px-1 py-1">
                <Avatar author={member} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {member.name}
                  {isMe && (
                    <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                  )}
                </span>
                {isMe ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Leave room"
                    disabled={mutating}
                    onClick={() => void handleLeave()}
                    title="Leave room"
                  >
                    <LogOut className="size-3.5" />
                  </Button>
                ) : isOwner ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${member.name}`}
                    disabled={mutating}
                    onClick={() => void handleRemove(member.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            )
          })}
          {mutateError && (
            <p className="pt-1 text-xs text-destructive" role="alert">{mutateError}</p>
          )}
        </div>
        {/* Add people section */}
        <div className="border-t px-4 pb-4 pt-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <UserPlus className="size-3.5" />
            Add people
          </div>
          {loadingWorkspace && (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
          {!loadingWorkspace && workspaceError && (
            <p className="text-xs text-destructive" role="alert">{workspaceError}</p>
          )}
          {!loadingWorkspace && !workspaceError && addable.length === 0 && (
            <p className="text-xs text-muted-foreground">Everyone is already a member.</p>
          )}
          {!loadingWorkspace && !workspaceError && addable.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {addable.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={mutating}
                  onClick={() => void handleAdd(u.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <Avatar author={u} />
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Timeline({
  messages,
  runs,
  openRun,
}: {
  messages: RoomMessage[]
  runs: RoomRun[]
  openRun: (runId: string) => void
}) {
  const items = useMemo(() => {
    const statuses = new Map(runs.map((run) => [run.triggerMessageId, run]))
    const results = runs
      .filter((run) => run.state === 'succeeded')
      .map((run) => ({
        id: `result-${run.id}`,
        result: run,
        createdAt: run.completedAt ?? run.createdAt,
      }))
    const sorted = [
      ...messages.map((message) => ({
        id: message.id,
        message,
        createdAt: message.createdAt,
      })),
      ...results,
    ].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    const authorId = (item: (typeof sorted)[number]) =>
      'result' in item ? 'software-engineer' : item.message.author.id
    return sorted.map((item, index) => {
      const previous = sorted[index - 1]
      return {
        ...item,
        run: 'message' in item ? statuses.get(item.message.id) : undefined,
        grouped: messagesAreGrouped(
          previous
            ? { authorId: authorId(previous), createdAt: previous.createdAt }
            : undefined,
          { authorId: authorId(item), createdAt: item.createdAt },
        ),
      }
    })
  }, [messages, runs])

  if (!items.length)
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No messages yet. Start the conversation.
      </p>
    )
  return (
    <div>
      {items.map((item) => {
        const isResult = 'result' in item
        const author =
          'result' in item
            ? { id: 'software-engineer', name: 'Software engineer' }
            : item.message.author
        const text =
          'result' in item
            ? (item.result.output ?? item.result.stdout) || 'Completed.'
            : item.message.text
        const isAgent = isResult || (!isResult && item.message.author.kind === 'agent')
        return (
          <article
            className={`flex gap-3 ${item.grouped ? 'mt-1' : 'mt-5 first:mt-0'}`}
            key={item.id}
          >
            {item.grouped ? (
              <div className="w-9 shrink-0" aria-hidden="true" />
            ) : (
              <Avatar author={author} agent={isAgent} />
            )}
            <div className="min-w-0 flex-1">
              {!item.grouped && (
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{author.name}</span>
                  <time className="text-xs text-muted-foreground">
                    {timestamp(item.createdAt)}
                  </time>
                </div>
              )}
              <div className={`${item.grouped ? '' : 'mt-0.5'} text-sm leading-6`}>
                <Markdown>{text}</Markdown>
              </div>
              {!isResult && item.run && (
                <RunCapsule run={item.run} openRun={openRun} />
              )}
              {isResult && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="mt-1 -ml-2 text-muted-foreground"
                  onClick={() => openRun(item.result.id)}
                >
                  Activity
                </Button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

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
