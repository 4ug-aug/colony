import { Check, CircleX, X } from 'lucide-react'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { AvatarGroup } from '#/components/ui/avatar'
import { useAgentName } from '#/features/agents/use-agent-definitions'
import { RunAvatar } from './run-avatar'
import { ProviderIcon } from '#/components/provider-icon'
import { llmProviderName } from '#/lib/llm-provider'
import { cn } from '#/lib/utils'
import type { RoomRun } from '#/features/rooms/types'

export function RunCapsule({
  run,
  openRun,
  className,
}: {
  run: RoomRun
  openRun: (runId: string) => void
  className?: string
}) {
  const name = useAgentName(run.agentId)
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
      className={cn(
        'mt-2 inline-flex items-center gap-1.5 rounded-md border bg-muted/30 py-1 pl-1 pr-2 text-xs text-muted-foreground hover:bg-muted cursor-pointer',
        className,
      )}
      aria-label={`View ${name} activity using ${llmProviderName(run.provider)}, ${state}`}
      onClick={() => openRun(run.id)}
    >
      <AvatarGroup>
        <RunAvatar run={run} />
      </AvatarGroup>
      <ProviderIcon provider={run.provider} className="size-3.5" />
      {run.state === 'succeeded' ? (
        <Check className="size-3.5 text-primary" />
      ) : run.state === 'failed' ? (
        <CircleX className="size-3.5 text-destructive" />
      ) : run.state === 'cancelled' ? (
        <X className="size-3.5" />
      ) : (
        <BrailleLoader text="Working" className="[&_svg]:size-3.5" />
      )}
      <span>1</span>
    </button>
  )
}
