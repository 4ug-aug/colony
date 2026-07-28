import { useEffect, useMemo, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Bot, Hash, Lock, LogOut, Terminal, UserPlus, Users, Wifi, WifiOff, X } from 'lucide-react'
import { authClient, sweatApiUrl } from '#/lib/auth-client'
import { stepLabel } from '#/step-label'
import type { Step } from '#/step-label'
import { Button } from '#/components/ui/button'
import { MessageComposer } from '#/components/message-composer'
import type { MessageComposerHandle } from '#/components/message-composer'
import { Markdown } from '#/components/markdown'
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

type Author = { id: string; name: string; image?: string; kind?: 'user' | 'agent' }
type Room = { id: string; name: string; visibility: 'public' | 'private'; createdBy?: string }
type RoomMessage = {
  id: string
  roomId: string
  author: Author
  text: string
  createdAt: number
}
type RoomRun = {
  id: string
  roomId: string
  triggerMessageId: string
  requestedBy: Author
  task: string
  agentId: string
  state: 'preparing' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
  stdout: string
  output?: string
}
type StreamMessage =
  | {
      type: 'room.snapshot'
      room: Room
      messages: RoomMessage[]
      runs: RoomRun[]
      latestSteps: Step[]
    }
  | { type: 'room.created'; room: Room }
  | { type: 'message.created'; message: RoomMessage }
  | { type: 'run.changed'; run: RoomRun }
  | { type: 'run.step'; runId: string; step: Step }
  | { type: 'room.removed'; roomId: string }
  | { type: 'room.members.changed'; roomId: string }

const terminal = (state: RoomRun['state']) =>
  state === 'succeeded' || state === 'failed' || state === 'cancelled'

function roomStreamUrl(roomId: string) {
  const url = new URL(sweatApiUrl(`/api/rooms/${roomId}/stream`))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function upsert<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex(({ id }) => id === item.id)
  return index < 0
    ? [...items, item]
    : items.map((value) => (value.id === item.id ? item : value))
}

function orderedRooms(rooms: Room[]) {
  return [...rooms].sort(
    (a, b) =>
      (a.id === 'general' ? -1 : b.id === 'general' ? 1 : 0) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  )
}

const selectedRoomKey = 'sweat.selected-room'

function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string>()
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [runs, setRuns] = useState<RoomRun[]>([])
  const runsRef = useRef<RoomRun[]>([])
  const [latestStepByRun, setLatestStepByRun] = useState<Map<string, Step>>(new Map())
  const [loading, setLoading] = useState(true)
  const [, setDraftVersion] = useState(0)
  const [connection, setConnection] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('connecting')
  const [error, setError] = useState<string>()
  const [createError, setCreateError] = useState<string>()
  const [membersChangedAt, setMembersChangedAt] = useState<Record<string, number>>({})
  const socket = useRef<WebSocket | undefined>(undefined)
  const drafts = useRef<Record<string, string>>({})

  useEffect(() => {
    void fetch(sweatApiUrl('/api/rooms'), { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load rooms')
        const result = (await response.json()) as { rooms: Room[] }
        setRooms(orderedRooms(result.rooms))
        const saved = localStorage.getItem(selectedRoomKey)
        setSelectedRoomId(
          result.rooms.some(({ id }) => id === saved)
            ? saved!
            : (
                result.rooms.find(({ id }) => id === 'general') ??
                result.rooms.at(0)
              )?.id,
        )
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : 'Unable to load rooms',
        ),
      )
  }, [])

  useEffect(() => {
    if (!selectedRoomId) return
    let stopped = false
    let attempts = 0
    let retry: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
      if (stopped) return
      const next = new WebSocket(roomStreamUrl(selectedRoomId))
      socket.current = next
      next.onopen = () => {
        attempts = 0
        setConnection('connected')
      }
      next.onmessage = ({ data }) => {
        const event = JSON.parse(data) as StreamMessage
        if (stopped) return
        if (event.type === 'room.created') {
          setRooms((current) => orderedRooms(upsert(current, event.room)))
          return
        }
        if (event.type === 'room.snapshot') {
          if (event.room.id !== selectedRoomId) return
          setMessages(event.messages)
          runsRef.current = event.runs
          setRuns(event.runs)
          setLatestStepByRun(new Map(event.latestSteps.map((s) => [s.runId, s])))
          setLoading(false)
        }
        if (
          event.type === 'message.created' &&
          event.message.roomId === selectedRoomId
        )
          setMessages((current) => upsert(current, event.message))
        if (event.type === 'run.changed' && event.run.roomId === selectedRoomId) {
          runsRef.current = upsert(runsRef.current, event.run)
          setRuns((current) => upsert(current, event.run))
        }
        if (event.type === 'run.step' && runsRef.current.some((r) => r.id === event.runId))
          setLatestStepByRun((current) => {
            const next = new Map(current)
            next.set(event.runId, event.step)
            return next
          })
        if (event.type === 'room.removed') {
          setRooms((current) => {
            const next = current.filter(({ id }) => id !== event.roomId)
            setSelectedRoomId((currentId) => {
              if (currentId !== event.roomId) return currentId
              const fallback =
                next.find(({ id }) => id === 'general') ?? next.at(0)
              const fallbackId = fallback?.id
              if (fallbackId) localStorage.setItem(selectedRoomKey, fallbackId)
              return fallbackId
            })
            return next
          })
        }
        if (event.type === 'room.members.changed') {
          setMembersChangedAt((current) => ({
            ...current,
            [event.roomId]: Date.now(),
          }))
        }
      }
      next.onclose = () => {
        if (stopped) return
        if (attempts++ >= 5) {
          setConnection('disconnected')
          setError('Coordinator unavailable')
          return
        }
        setConnection('reconnecting')
        retry = setTimeout(connect, Math.min(1_000 * 2 ** attempts, 10_000))
      }
      next.onerror = () => next.close()
    }
    connect()
    return () => {
      stopped = true
      if (retry) clearTimeout(retry)
      socket.current?.close()
    }
  }, [selectedRoomId])

  const post = async <T,>(
    path: string,
    body?: unknown,
  ): Promise<T | undefined> => {
    try {
      const response = await fetch(sweatApiUrl(path), {
        method: 'POST',
        credentials: 'include',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const result = (await response.json()) as T & { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Request failed')
      setError(undefined)
      return result
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Request failed')
    }
  }

  return {
    rooms,
    room: rooms.find(({ id }) => id === selectedRoomId),
    messages,
    runs,
    latestStepByRun,
    loading,
    connection,
    error,
    membersChangedAt,
    select: (roomId: string) => {
      if (roomId === selectedRoomId) return
      setSelectedRoomId(roomId)
      localStorage.setItem(selectedRoomKey, roomId)
      setMessages([])
      setRuns([])
      setLatestStepByRun(new Map())
      setLoading(true)
      setConnection('connecting')
    },
    draft: selectedRoomId ? (drafts.current[selectedRoomId] ?? '') : '',
    setDraft: (text: string) => {
      if (selectedRoomId) {
        drafts.current[selectedRoomId] = text
        setDraftVersion((version) => version + 1)
      }
    },
    create: async (name: string, visibility: 'public' | 'private' = 'public') => {
      try {
        const response = await fetch(sweatApiUrl('/api/rooms'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, visibility }),
        })
        const result = (await response.json()) as {
          room?: Room
          error?: string
        }
        if (!response.ok || !result.room)
          throw new Error(result.error ?? 'Unable to create room')
        setCreateError(undefined)
        setError(undefined)
        setRooms((current) => orderedRooms(upsert(current, result.room!)))
        setSelectedRoomId(result.room.id)
        localStorage.setItem(selectedRoomKey, result.room.id)
        setMessages([])
        setRuns([])
        setLoading(true)
        setConnection('connecting')
        return result
      } catch (reason) {
        setCreateError(
          reason instanceof Error ? reason.message : 'Unable to create room',
        )
      }
    },
    createError,
    send: async (text: string) => {
      if (!selectedRoomId) return
      const result = await post<{ message: RoomMessage; run?: RoomRun }>(
        `/api/rooms/${selectedRoomId}/messages`,
        { text },
      )
      if (result) {
        setMessages((current) => upsert(current, result.message))
        if (result.run) setRuns((current) => upsert(current, result.run!))
      }
      return result
    },
    cancel: (runId: string) =>
      selectedRoomId
        ? post(`/api/rooms/${selectedRoomId}/runs/${runId}/cancel`)
        : undefined,
  }
}

function Avatar({
  author,
  agent = false,
}: {
  author: Author
  agent?: boolean
}) {
  if (author.image)
    return (
      <img
        className="mt-0.5 size-9 shrink-0 rounded-full object-cover"
        src={author.image}
        alt=""
      />
    )
  return (
    <div
      className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
      aria-hidden="true"
    >
      {agent ? (
        <Bot className="size-4" />
      ) : (
        author.name.slice(0, 1).toUpperCase()
      )}
    </div>
  )
}

function timestamp(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}

function StepsPopover({ run, roomId }: { run: RoomRun; roomId: string }) {
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const handleOpen = async (open: boolean) => {
    if (!open || steps !== null) return
    setError(false)
    setLoading(true)
    try {
      const res = await fetch(
        sweatApiUrl(`/api/rooms/${roomId}/runs/${run.id}/steps`),
        { credentials: 'include' },
      )
      const data = (await res.json()) as { steps: Step[] }
      setSteps(data.steps.sort((a, b) => a.idx - b.idx))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  // Pair tool_call with following tool_result by callId
  const pairedItems = useMemo(() => {
    if (!steps) return []
    const resultByCallId = new Map<string, Step>()
    for (const s of steps) {
      if (s.kind === 'tool_result' && s.callId) resultByCallId.set(s.callId, s)
    }
    return steps
      .filter((s) => s.kind !== 'tool_result')
      .map((s) => {
        if (s.kind === 'tool_call' && s.callId) {
          const result = resultByCallId.get(s.callId) ?? null
          return { call: s, result }
        }
        return { call: null, result: null, message: s }
      })
  }, [steps])

  return (
    <Popover onOpenChange={(open) => void handleOpen(open)}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="xs" className="text-muted-foreground">
          Steps
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-h-[28rem] overflow-y-auto p-0">
        <PopoverHeader className="px-4 pt-4 pb-2">
          <PopoverTitle>Run steps</PopoverTitle>
        </PopoverHeader>
        <div className="px-4 pb-4 space-y-2">
          {loading && (
            <p className="py-3 text-xs text-muted-foreground">Loading…</p>
          )}
          {!loading && error && (
            <p className="py-3 text-xs text-destructive">Could not load steps</p>
          )}
          {!loading && !error && steps !== null && steps.length === 0 && (
            <p className="py-3 text-xs text-muted-foreground">No steps recorded</p>
          )}
          {!loading && !error && pairedItems.map((item, i) => {
            const enter = 'animate-in fade-in-0 slide-in-from-bottom-1 duration-300'
            const enterStyle = { animationDelay: `${Math.min(i * 45, 270)}ms`, animationFillMode: 'both' as const }
            if (item.message) {
              return (
                <div key={item.message.id} className={`rounded-md border bg-muted/40 px-3 py-2 text-xs ${enter}`} style={enterStyle}>
                  <div className="mb-1 font-medium text-muted-foreground">Reasoning</div>
                  <div className="whitespace-pre-wrap break-words">{item.message.text}</div>
                </div>
              )
            }
            if (item.call) {
              const tool = item.call.tool ?? 'unknown'
              return (
                <details key={item.call.id} className={`rounded-md border bg-muted/40 px-3 py-2 text-xs group ${enter}`} style={enterStyle}>
                  <summary className="cursor-pointer font-medium text-muted-foreground list-none flex items-center justify-between">
                    <span>{tool}{item.result ? ' ✓' : ' (pending)'}</span>
                    <span className="text-muted-foreground/60 text-[10px] group-open:hidden">expand</span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div>
                      <div className="mb-0.5 font-semibold text-muted-foreground/70">Arguments</div>
                      <div className="whitespace-pre-wrap break-words font-mono">{item.call.text}</div>
                    </div>
                    {item.result && (
                      <div>
                        <div className="mb-0.5 font-semibold text-muted-foreground/70">Result</div>
                        <div className="whitespace-pre-wrap break-words font-mono">{item.result.text}</div>
                      </div>
                    )}
                  </div>
                </details>
              )
            }
            return null
          })}
        </div>
      </PopoverContent>
    </Popover>
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
  latestStepByRun,
  roomId,
  cancel,
}: {
  messages: RoomMessage[]
  runs: RoomRun[]
  latestStepByRun: Map<string, Step>
  roomId: string
  cancel: (runId: string) => void
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
    return [
      ...messages.map((message) => ({
        id: message.id,
        message,
        createdAt: message.createdAt,
      })),
      ...results,
    ]
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((item) => ({
        ...item,
        run: 'message' in item ? statuses.get(item.message.id) : undefined,
      }))
  }, [messages, runs])

  if (!items.length)
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No messages yet. Start the conversation.
      </p>
    )
  return (
    <div className="space-y-5">
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
          <article className="flex gap-3" key={item.id}>
            <Avatar author={author} agent={isAgent} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold">{author.name}</span>
                <time className="text-xs text-muted-foreground">
                  {timestamp(item.createdAt)}
                </time>
              </div>
              <div className="mt-0.5 text-sm leading-6">
                <Markdown>{text}</Markdown>
              </div>
              {!isResult && item.run && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/60 px-2 py-1">
                    <Terminal className="size-3" />
                    Software engineer{' '}
                    {(() => {
                      const step = latestStepByRun.get(item.run.id)
                      const label = terminal(item.run.state)
                        ? item.run.state === 'succeeded'
                          ? 'completed'
                          : item.run.state
                        : step
                          ? stepLabel(step)
                          : item.run.state === 'preparing'
                            ? 'is preparing'
                            : 'is working'
                      return (
                        <span
                          key={label}
                          className="inline-block animate-in fade-in slide-in-from-bottom-0.5 duration-300"
                        >
                          {label}
                        </span>
                      )
                    })()}
                  </span>
                  <StepsPopover run={item.run} roomId={roomId} />
                  {!terminal(item.run.state) && (
                    <Button type="button" variant="ghost" size="xs" onClick={() => cancel(item.run!.id)}>
                      Cancel
                    </Button>
                  )}
                  {item.run.error && <span className="text-destructive">{item.run.error}</span>}
                </div>
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
  }, [room?.id])

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
                    variant="ghost"
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
          <div className="flex items-center gap-2 px-2 py-1">
            <Avatar author={user} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {user.name}
            </span>
            <Button
              aria-label="Sign out"
              variant="ghost"
              size="icon-xs"
              onClick={() => void authClient.signOut()}
            >
              ↪
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
        <div className="flex min-h-0 flex-1 flex-col">
          <section
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-5 py-6 sm:px-8"
            aria-busy={loading}
            onScroll={() => {
              const el = scrollRef.current
              if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150
            }}
          >
            <div className="mx-auto max-w-4xl">
              {loading ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Loading room…
                </p>
              ) : (
                <Timeline
                  messages={messages}
                  runs={runs}
                  latestStepByRun={latestStepByRun}
                  roomId={room?.id ?? ''}
                  cancel={(runId) => void cancel(runId)}
                />
              )}
            </div>
          </section>
          <div className="shrink-0 px-4 pb-4 sm:px-6">
            <div className="mx-auto max-w-4xl rounded-2xl border bg-background p-3 shadow-sm">
              <MessageComposer
                ref={composer}
                value={draft}
                onChange={setDraft}
                onSubmit={(text) => void submit(text)}
                disabled={loading || !room}
                roomName={room?.name ?? 'room'}
              />
            </div>
            {error && (
              <p
                className="mx-auto mt-2 max-w-4xl text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
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
