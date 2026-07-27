import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AtSign, Bot, Hash, Send, Terminal, Wifi, WifiOff } from 'lucide-react'
import { authClient, sweatApiUrl } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '#/components/ui/sidebar'

type Author = { id: string; name: string; image?: string }
type Room = { id: string; name: string }
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
    }
  | { type: 'message.created'; message: RoomMessage }
  | { type: 'run.changed'; run: RoomRun }

const agentMention = '@software-engineer '
const terminal = (state: RoomRun['state']) =>
  state === 'succeeded' || state === 'failed' || state === 'cancelled'

function roomStreamUrl() {
  const url = new URL(sweatApiUrl('/api/rooms/general/stream'))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function upsert<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex(({ id }) => id === item.id)
  return index < 0
    ? [...items, item]
    : items.map((value) => (value.id === item.id ? item : value))
}

function useRoom() {
  const [room, setRoom] = useState<Room>({ id: 'general', name: 'General' })
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [runs, setRuns] = useState<RoomRun[]>([])
  const [connection, setConnection] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('connecting')
  const [error, setError] = useState<string>()
  const socket = useRef<WebSocket | undefined>(undefined)

  useEffect(() => {
    void fetch(sweatApiUrl('/api/rooms'), { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load rooms')
        const result = (await response.json()) as { rooms: Room[] }
        const general = result.rooms.find(({ id }) => id === 'general')
        if (general) setRoom(general)
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : 'Unable to load rooms',
        ),
      )
  }, [])

  useEffect(() => {
    let stopped = false
    let attempts = 0
    let retry: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
      if (stopped) return
      const next = new WebSocket(roomStreamUrl())
      socket.current = next
      next.onopen = () => {
        attempts = 0
        setConnection('connected')
      }
      next.onmessage = ({ data }) => {
        const event = JSON.parse(data) as StreamMessage
        if (event.type === 'room.snapshot') {
          setRoom(event.room)
          setMessages(event.messages)
          setRuns(event.runs)
        }
        if (event.type === 'message.created')
          setMessages((current) => upsert(current, event.message))
        if (event.type === 'run.changed')
          setRuns((current) => upsert(current, event.run))
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
  }, [])

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
    room,
    messages,
    runs,
    connection,
    error,
    send: async (text: string) => {
      const result = await post<{ message: RoomMessage; run?: RoomRun }>(
        '/api/rooms/general/messages',
        { text },
      )
      if (result) {
        setMessages((current) => upsert(current, result.message))
        if (result.run) setRuns((current) => upsert(current, result.run!))
      }
      return result
    },
    cancel: (runId: string) => post(`/api/rooms/general/runs/${runId}/cancel`),
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

function MentionText({ text }: { text: string }) {
  const pieces = text.split(/(@software-engineer\b)/g)
  return (
    <>
      {pieces.map((piece, index) =>
        piece === '@software-engineer' ? (
          <span
            className="rounded bg-muted px-1.5 py-0.5 text-sm font-medium text-muted-foreground"
            key={index}
          >
            software engineer
          </span>
        ) : (
          piece
        ),
      )}
    </>
  )
}

function timestamp(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}

function RunBadge({ run, onCancel }: { run: RoomRun; onCancel: () => void }) {
  const label =
    run.state === 'preparing'
      ? 'is preparing'
      : run.state === 'running'
        ? 'is working'
        : run.state === 'succeeded'
          ? 'completed'
          : run.state
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/60 px-2 py-1">
        <Terminal className="size-3" />
        Software engineer {label}
      </span>
      {!terminal(run.state) && (
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
      )}
      {run.error && <span className="text-destructive">{run.error}</span>}
    </div>
  )
}

function Timeline({
  messages,
  runs,
  cancel,
}: {
  messages: RoomMessage[]
  runs: RoomRun[]
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
        const author = isResult
          ? { id: 'software-engineer', name: 'Software engineer' }
          : item.message!.author
        const text = isResult
          ? (item.result!.output ?? item.result!.stdout) || 'Completed.'
          : item.message!.text
        return (
          <article className="flex gap-3" key={item.id}>
            <Avatar author={author} agent={isResult} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold">{author.name}</span>
                <time className="text-xs text-muted-foreground">
                  {timestamp(item.createdAt)}
                </time>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words leading-6">
                <MentionText text={text} />
              </p>
              {!isResult && item.run && (
                <RunBadge
                  run={item.run}
                  onCancel={() => cancel(item.run!.id)}
                />
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function Dashboard({ user }: { user: Author }) {
  const { room, messages, runs, connection, error, send, cancel } = useRoom()
  const [text, setText] = useState('')
  const composer = useRef<HTMLTextAreaElement>(null)
  const delegated = text.startsWith(agentMention)
  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (!text.trim()) return
    const result = await send(text)
    if (result) setText('')
  }
  const insertAgent = () => {
    setText((current) =>
      current.startsWith(agentMention) ? current : `${agentMention}${current}`,
    )
    composer.current?.focus()
  }

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <div className="flex h-9 items-center gap-2 px-2 font-semibold">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              S
            </span>
            <span>Sweat</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Rooms</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive tooltip="General">
                    <Hash />
                    <span>{room.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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
                    onClick={insertAgent}
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
      <SidebarInset className="min-h-[calc(100svh-1rem)] overflow-hidden border border-border/70 bg-background">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Hash className="size-4 text-muted-foreground" />
          <h1 className="font-semibold">{room.name}</h1>
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
          <section className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
            <div className="mx-auto max-w-4xl">
              <Timeline
                messages={messages}
                runs={runs}
                cancel={(runId) => void cancel(runId)}
              />
            </div>
          </section>
          <div className="shrink-0 px-4 pb-4 sm:px-6">
            <div className="mx-auto max-w-4xl rounded-2xl border bg-background p-3 shadow-sm">
              <form onSubmit={(event) => void submit(event)}>
                <textarea
                  ref={composer}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void submit()
                    }
                  }}
                  placeholder={`Message #${room.id}`}
                  className="min-h-20 w-full resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
                />
                <div className="mt-2 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Mention software engineer"
                    onClick={insertAgent}
                  >
                    <AtSign />
                  </Button>
                  <Button
                    type="submit"
                    size="icon-sm"
                    className="rounded-full"
                    aria-label={
                      delegated
                        ? 'Delegate to software engineer'
                        : 'Send message'
                    }
                    disabled={!text.trim()}
                  >
                    <Send />
                  </Button>
                </div>
              </form>
            </div>
            {error && (
              <p className="mx-auto mt-2 max-w-4xl text-sm text-destructive">
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
  const submit = async (event: FormEvent<HTMLFormElement>) => {
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
