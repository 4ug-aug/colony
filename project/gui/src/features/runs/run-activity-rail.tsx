import { Markdown } from '#/components/markdown'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '#/components/ui/sheet'
import { apiFetch } from '#/lib/api-transport'
import { Ban, CheckCircle2, CircleX, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatStepText,
  groupActivity,
  mergeSteps,
  pairSteps,
} from './run-activity'
import { RunActivitySplitHeader } from './run-activity-dither'
import { terminal } from './run-helpers'
import { useAgentName } from '#/features/agents/use-agent-definitions'
import { ToolIcon } from './run-tool-icon'
import type { Step } from './step-label'
import { stepLabel } from './step-label'

type Person = { name: string; image?: string }
type ActivityRun = {
  id: string
  roomId: string
  agentId: string
  provider: 'openai' | 'custom' | 'cursor'
  model: string
  task: string
  requestedBy: Person
  state: 'preparing' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  error?: string
  stdout: string
  output?: string
  attribution?: string
}
type TriggerMessage = { author: Person; text: string }

function useInlineRail() {
  const [inline, setInline] = useState(
    () => window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setInline(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return inline
}

function PersonAvatar({ person }: { person: Person }) {
  return (
    <Avatar>
      {person.image && <AvatarImage src={person.image} alt="" />}
      <AvatarFallback>{person.name.slice(0, 1).toUpperCase()}</AvatarFallback>
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
  attribution,
}: {
  run: ActivityRun
  triggerMessage?: TriggerMessage
  steps: Step[]
  loading: boolean
  error?: string
  onRetry: () => void
  onClose: () => void
  onCancel: () => void
  attribution?: string
}) {
  const agent = useAgentName(run.agentId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const followLive = useRef(!terminal(run.state))
  const groups = useMemo(() => groupActivity(pairSteps(steps)), [steps])
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
      <RunActivitySplitHeader
        agent={agent}
        provider={run.provider}
        model={run.model}
        state={run.state}
        status={status}
        onClose={onClose}
        onCancel={onCancel}
      />
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto p-4"
        onScroll={() => {
          const element = scrollRef.current
          if (element)
            atBottom.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              80
        }}
      >
        <section className="flex gap-3 border-b pb-5">
          <PersonAvatar person={triggerMessage?.author ?? run.requestedBy} />
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-sm font-semibold">
              {(triggerMessage?.author ?? run.requestedBy).name}
            </p>
            {attribution && <p className="mb-1 text-xs text-muted-foreground">{attribution}</p>}
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
            <p className="text-sm text-muted-foreground" role="status">
              <BrailleLoader text="Loading activity" />
            </p>
          )}
          {error && !steps.length && (
            <div className="flex items-center gap-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
                <RotateCw data-icon="inline-start" />
                Retry
              </Button>
            </div>
          )}
          {!loading && !error && !groups.length && (
            <p className="text-sm text-muted-foreground">
              No activity recorded yet.
            </p>
          )}
          <div className="space-y-3">
            {groups.map((group, index) =>
              group.kind === 'reasoning' ? (
                <article
                  key={group.item.step.id}
                  className="text-sm animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
                >
                  <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Reasoning</span>
                    <time>
                      {new Date(group.item.step.createdAt).toLocaleTimeString(
                        [],
                        {
                          hour: 'numeric',
                          minute: '2-digit',
                        },
                      )}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap break-words leading-6">
                    {group.item.step.text}
                  </p>
                </article>
              ) : (
                <div
                  key={`tools-${index}`}
                  className="overflow-hidden rounded-sm border divide-y"
                >
                  {group.items.map(({ step, result }) => (
                    <details
                      key={step.id}
                      className="group px-3 py-2 text-xs animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium">
                        <span className="flex min-w-0 items-center gap-2">
                          <ToolIcon tool={step.tool} />
                          <span className="truncate font-mono text-xs">
                            {step.tool ?? 'Tool call'}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {result ? 'Completed' : 'Pending'}
                        </span>
                      </summary>
                      <div className="mt-3 space-y-3 text-xs group-open:animate-in group-open:fade-in-0 group-open:slide-in-from-top-1 group-open:duration-200">
                        <div>
                          <p className="mb-1 font-semibold text-muted-foreground">
                            Arguments
                          </p>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 font-mono text-xs leading-5">
                            {formatStepText(step.text)}
                          </pre>
                        </div>
                        {result && (
                          <div>
                            <p className="mb-1 font-semibold text-muted-foreground">
                              Result
                            </p>
                            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 font-mono text-xs leading-5">
                              {formatStepText(result.text)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
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
            <BrailleLoader text={status} />
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
  stepsPath,
}: {
  run: ActivityRun
  triggerMessage?: TriggerMessage
  liveSteps: Step[]
  onClose: () => void
  onCancel: () => void
  stepsPath?: string
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
    void apiFetch(stepsPath ?? `/api/rooms/${run.roomId}/runs/${run.id}/steps`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load run activity')
        const data = (await response.json()) as { steps: Step[] }
        setPersistedSteps(data.steps)
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load run activity',
          )
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
      attribution={run.attribution}
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
