import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  Bot,
  CheckCircle2,
  CircleX,
  LoaderCircle,
  RotateCw,
  X,
} from 'lucide-react'
import { sweatApiUrl } from '#/lib/auth-client'
import { formatStepText, mergeSteps, pairSteps } from '#/run-activity'
import { stepLabel } from '#/step-label'
import type { Step } from '#/step-label'
import { Markdown } from '#/components/markdown'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '#/components/ui/sheet'

type Person = { name: string; image?: string }
type ActivityRun = {
  id: string
  roomId: string
  agentId: string
  task: string
  requestedBy: Person
  state: 'preparing' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  error?: string
  stdout: string
  output?: string
}
type TriggerMessage = { author: Person; text: string }

const terminal = (state: ActivityRun['state']) =>
  state === 'succeeded' || state === 'failed' || state === 'cancelled'

const agentName = (agentId: string) =>
  agentId === 'software-engineer' ? 'Software engineer' : agentId

function useInlineRail() {
  const [inline, setInline] = useState(() =>
    window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setInline(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return inline
}

function PersonAvatar({ person, agent = false }: { person: Person; agent?: boolean }) {
  return (
    <Avatar>
      {person.image && <AvatarImage src={person.image} alt="" />}
      <AvatarFallback className={agent ? 'bg-primary/10 text-primary' : undefined}>
        {agent ? <Bot className="size-4" /> : person.name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}

function RunActivityContent({
  run,
  triggerMessage,
  steps,
  loading,
  error,
  onRetry,
  onClose,
  onCancel,
}: {
  run: ActivityRun
  triggerMessage?: TriggerMessage
  steps: Step[]
  loading: boolean
  error?: string
  onRetry: () => void
  onClose: () => void
  onCancel: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const followLive = useRef(!terminal(run.state))
  const items = useMemo(() => pairSteps(steps), [steps])
  const latest = steps.at(-1)
  const status =
    run.state === 'succeeded'
      ? 'Completed'
      : run.state === 'failed'
        ? 'Failed'
        : run.state === 'cancelled'
          ? 'Cancelled'
          : latest
            ? stepLabel(latest)
            : run.state === 'preparing'
              ? 'Preparing'
              : 'Working'

  useEffect(() => {
    const element = scrollRef.current
    if (element && followLive.current && atBottom.current)
      element.scrollTop = element.scrollHeight
  }, [run.state, steps.length])

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <PersonAvatar person={{ name: agentName(run.agentId) }} agent />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">Run activity</h2>
          <p
            key={status}
            className="truncate text-xs text-muted-foreground animate-in fade-in-0 slide-in-from-bottom-0.5 duration-300"
          >
            {agentName(run.agentId)} · {status}
          </p>
        </div>
        {!terminal(run.state) && (
          <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close run activity"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto p-4"
        onScroll={() => {
          const element = scrollRef.current
          if (element)
            atBottom.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 80
        }}
      >
        <section className="flex gap-3 border-b pb-5">
          <PersonAvatar person={triggerMessage?.author ?? run.requestedBy} />
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-sm font-semibold">
              {(triggerMessage?.author ?? run.requestedBy).name}
            </p>
            <div className="text-sm leading-6">
              <Markdown>{triggerMessage?.text ?? run.task}</Markdown>
            </div>
          </div>
        </section>

        <section className="py-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Activity
          </h3>
          {loading && !steps.length && (
            <p className="text-sm text-muted-foreground">Loading activity…</p>
          )}
          {error && !steps.length && (
            <div className="flex items-center gap-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
                <RotateCw />
                Retry
              </Button>
            </div>
          )}
          {!loading && !error && !items.length && (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          )}
          <div className="space-y-3">
            {items.map(({ step, result }) =>
              step.kind === 'message' ? (
                <article
                  key={step.id}
                  className="text-sm animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
                >
                  <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Reasoning</span>
                    <time>{new Date(step.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
                  </div>
                  <p className="whitespace-pre-wrap break-words leading-6">{step.text}</p>
                </article>
              ) : (
                <details
                  key={step.id}
                  className="group rounded-lg border px-3 py-2 text-xs animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium">
                    <span className="truncate font-mono text-xs">
                      {step.tool ?? 'Tool call'}
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {result ? 'Completed' : 'Pending'}
                    </span>
                  </summary>
                  <div className="mt-3 space-y-3 text-xs group-open:animate-in group-open:fade-in-0 group-open:slide-in-from-top-1 group-open:duration-200">
                    <div>
                      <p className="mb-1 font-semibold text-muted-foreground">Arguments</p>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 font-mono text-xs leading-5">
                        {formatStepText(step.text)}
                      </pre>
                    </div>
                    {result && (
                      <div>
                        <p className="mb-1 font-semibold text-muted-foreground">Result</p>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 font-mono text-xs leading-5">
                          {formatStepText(result.text)}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              ),
            )}
          </div>
        </section>

        {run.state === 'succeeded' && (
          <section className="border-t pt-5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="size-4 text-primary" />
              Result
            </div>
            <Markdown>{(run.output ?? run.stdout) || 'Completed.'}</Markdown>
          </section>
        )}
        {run.state === 'failed' && (
          <section className="flex gap-2 border-t pt-5 text-sm text-destructive">
            <CircleX className="mt-0.5 size-4 shrink-0" />
            <p>{run.error ?? 'The run failed.'}</p>
          </section>
        )}
        {run.state === 'cancelled' && (
          <section className="flex gap-2 border-t pt-5 text-sm text-muted-foreground">
            <Ban className="mt-0.5 size-4 shrink-0" />
            <p>The run was cancelled.</p>
          </section>
        )}
        {!terminal(run.state) && (
          <div className="flex items-center gap-2 border-t pt-5 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {status}
          </div>
        )}
      </div>
    </>
  )
}

export function RunActivityRail({
  run,
  triggerMessage,
  liveSteps,
  onClose,
  onCancel,
}: {
  run: ActivityRun
  triggerMessage?: TriggerMessage
  liveSteps: Step[]
  onClose: () => void
  onCancel: () => void
}) {
  const inline = useInlineRail()
  const [persistedSteps, setPersistedSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [reload, setReload] = useState(0)
  const steps = useMemo(
    () => mergeSteps(persistedSteps, liveSteps),
    [persistedSteps, liveSteps],
  )

  useEffect(() => {
    const controller = new AbortController()
    setPersistedSteps([])
    setLoading(true)
    setError(undefined)
    void fetch(sweatApiUrl(`/api/rooms/${run.roomId}/runs/${run.id}/steps`), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load run activity')
        const data = (await response.json()) as { steps: Step[] }
        setPersistedSteps(data.steps)
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Could not load run activity')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload, run.id, run.roomId])

  const content = (
    <RunActivityContent
      run={run}
      triggerMessage={triggerMessage}
      steps={steps}
      loading={loading}
      error={error}
      onRetry={() => setReload((value) => value + 1)}
      onClose={onClose}
      onCancel={onCancel}
    />
  )

  if (inline)
    return (
      <aside
        className="flex w-[26rem] shrink-0 flex-col border-l bg-background animate-in fade-in-0 slide-in-from-right-2 duration-200"
        aria-label="Run activity"
      >
        {content}
      </aside>
    )

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-none gap-0 p-0 sm:max-w-md"
      >
        <SheetTitle className="sr-only">Run activity</SheetTitle>
        <SheetDescription className="sr-only">
          Agent assignment, execution activity, and result
        </SheetDescription>
        {content}
      </SheetContent>
    </Sheet>
  )
}
