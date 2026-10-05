import { AgentThinking } from '#/components/ui/agent-thinking'
import { useAgentName } from '#/features/agents/use-agent-definitions'
import { useLatestRunStep } from '#/features/rooms/room-live-steps'
import type { RoomRun } from '#/features/rooms/types'
import { llmProviderName } from '#/lib/llm-provider'
import { cn } from '#/lib/utils'
import { Check, ChevronRight, CircleX, X } from 'lucide-react'
import { runActivityLabel, runStatus, terminal } from './run-helpers'

/** What a working run is doing right now, like the Oneshot panel shows it. */
function LiveRunStatus({ run, name }: { run: RoomRun; name: string }) {
  const step = useLatestRunStep(run.roomId, run.id)
  return (
    <AgentThinking
      label={`${name} ${runStatus(run, step)}`}
      className="max-w-80 truncate text-xs font-normal"
    />
  )
}

export function RunCapsule({
  run,
  openRun,
  showModel = false,
  className,
}: {
  run: RoomRun
  openRun: (runId: string) => void
  showModel?: boolean
  className?: string
}) {
  const name = useAgentName(run.agentId)
  const label = runActivityLabel(run.state)
  const working = !terminal(run.state)
  const distinguish = showModel
    ? `, ${llmProviderName(run.provider)} ${run.model}`
    : ''
  return (
    <button
      type="button"
      className={cn('room-meta-control', className)}
      aria-label={`View ${name} activity, ${label}${distinguish}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => openRun(run.id)}
    >
      {working ? (
        <LiveRunStatus run={run} name={name} />
      ) : run.state === 'failed' ? (
        <>
          <CircleX className="size-3.5 text-destructive" aria-hidden="true" />
          <span>Failed</span>
        </>
      ) : run.state === 'cancelled' ? (
        <>
          <X className="size-3.5" aria-hidden="true" />
          <span>Cancelled</span>
        </>
      ) : (
        <>
          <Check className="size-3.5 text-green-500" aria-hidden="true" />
          <span>Completed</span>
        </>
      )}
      {showModel && (
        <span className="room-meta-secondary">
          {llmProviderName(run.provider)} · {run.model}
        </span>
      )}
      <ChevronRight
        className="size-3.5 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  )
}
