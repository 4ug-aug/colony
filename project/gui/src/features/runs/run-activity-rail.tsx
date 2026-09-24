import { Markdown } from '#/components/markdown'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { AgentThinking } from '#/components/ui/agent-thinking'
import { Button } from '#/components/ui/button'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import { useRoomLiveSteps } from '#/features/rooms/room-live-steps'
import { RoomSideRail } from '#/features/shell/room-side-rail'
import { accountFaceStyle, accountInitials } from '#/lib/account-color'
import { apiFetch } from '#/lib/api-transport'
import { Ban, CheckCircle2, CircleX, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { groupActivity, mergeSteps, pairSteps } from './run-activity'
import { RunActivitySplitHeader } from './run-activity-dither'
import { terminal } from './run-helpers'
import type { Step } from './step-label'
import { stepLabel } from './step-label'
import { ToolCallDetailsList } from './tool-call-details-list'

export type Person = { name: string; image?: string; color?: string }
export type ActivityRun = {
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
  /** What the runtime actually said. `error` is only ever its exit code. */
  stderr?: string
  output?: string
  attribution?: string
  waitingOn?: string
  preparation?: readonly string[]
  sandboxId?: string
}
export type TriggerMessage = { author: Person; text: string }

function PersonAvatar({ person }: { person: Person }) {
  return (
    <Avatar>
      {person.image && <AvatarImage src={person.image} alt="" />}
      <AvatarFallback
        className="font-semibold"
        style={accountFaceStyle(person.name, person.color)}
      >
        {accountInitials(person.name)}
      </AvatarFallback>
    </Avatar>
  )
}

export function RunActivityContent({
  run,
  triggerMessage,
  steps,
  loading,
  error,
  onRetry,
  onCancel,
  onOpenMachine,
  attribution,
  showClose = false,
}: {
  run: ActivityRun
  triggerMessage?: TriggerMessage
  steps: Step[]
  loading: boolean
  error?: string
  onRetry: () => void
  onCancel: () => void
  onOpenMachine?: (sandboxId: string) => void
  attribution?: string
  showClose?: boolean
}) {
  const { data: agents = [] } = useAgentDefinitions()
  const agentDefinition = agents.find((entry) => entry.id === run.agentId)
  const agent = agentDefinition?.name ?? run.agentId
  const skills = agentDefinition?.skills ?? []
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const followLive = useRef(!terminal(run.state))
  const sandboxId = run.sandboxId
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
            : run.waitingOn
              ? run.waitingOn
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
        agentId={run.agentId}
        provider={run.provider}
        model={run.model}
        state={run.state}
        status={status}
        skills={skills}
        showClose={showClose}
        onCancel={onCancel}
        onOpenMachine={
          onOpenMachine && sandboxId
            ? () => onOpenMachine(sandboxId)
            : undefined
        }
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
            {attribution && (
              <p className="mb-1 text-xs text-muted-foreground">
                {attribution}
              </p>
            )}
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
              <AgentThinking label="Loading activity" />
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
          {!loading && !error && !groups.length && !run.preparation?.length && (
            <p className="text-sm text-muted-foreground">
              No activity recorded yet.
            </p>
          )}
          {run.preparation?.length ? (
            <ol className="mb-3 space-y-1 text-sm text-muted-foreground">
              {run.preparation.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          ) : null}
          <div className="space-y-3">
            {groups.map((group, index) =>
              group.kind === 'reasoning' ? (
                <article key={group.item.step.id} className="text-sm">
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
                <ToolCallDetailsList
                  key={`tools-${index}`}
                  items={group.items}
                />
              ),
            )}
          </div>
        </section>

        {run.state === 'succeeded' && (
          <section className="border-t pt-5">
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
            <div className="min-w-0 space-y-2">
              <p className="break-all">{run.error ?? 'The run failed.'}</p>
              {run.stderr?.trim() ? (
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted px-2 py-1.5 font-mono text-[0.7rem] leading-4 text-muted-foreground">
                  {run.stderr}
                </pre>
              ) : null}
            </div>
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
            <AgentThinking label={status} showTimer />
          </div>
        )}
      </div>
    </>
  )
}

export function RunActivityRail({
  run,
  triggerMessage,
  onCancel,
  onOpenMachine,
}: {
  run: ActivityRun
  triggerMessage?: TriggerMessage
  onCancel: () => void
  onOpenMachine?: (sandboxId: string) => void
}) {
  const { liveStepsByRun } = useRoomLiveSteps(run.roomId)
  const liveSteps = liveStepsByRun.get(run.id) ?? []
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
    void apiFetch(`/api/rooms/${run.roomId}/runs/${run.id}/steps`, {
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
      showClose
      onCancel={onCancel}
      onOpenMachine={onOpenMachine}
      attribution={run.attribution}
    />
  )

  return (
    <RoomSideRail
      label="Run activity"
      description="Agent assignment, execution activity, and result"
      className="bg-background"
    >
      {content}
    </RoomSideRail>
  )
}
