import { Check, CircleX, LoaderCircle, X } from 'lucide-react'
import { AvatarGroup } from '#/components/ui/avatar'
import { RunAvatar } from './run-avatar'
import { agentName } from './run-helpers'
import type { RoomRun } from '#/features/rooms/types'

export function RunCapsule({
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
