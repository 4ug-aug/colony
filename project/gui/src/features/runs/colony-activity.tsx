import { AgentThinking } from '#/components/ui/agent-thinking'
import { Button } from '#/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { AgentMark } from '#/features/agents/agent-mark'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import {
  contextLabel,
  createActivitySession,
  headerPresentation,
  type ActivityHeaderPresentation,
} from './colony-activity-state'
import { runStatus } from './run-helpers'
import { useActiveWorkspaceRuns } from './use-active-workspace-runs'
import type { WorkspaceActivityRun } from '#/server/features/runs/workspace-activity'
import { Check, CircleX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const FLASH_MS = 4_000

function completeKey(presentation: ActivityHeaderPresentation): string {
  if (presentation.kind !== 'complete') return ''
  return presentation.runs.map((run) => run.id).sort().join(',')
}

export function ColonyActivity({
  onOpenActivity,
}: {
  onOpenActivity: (run: WorkspaceActivityRun) => void
}) {
  const { data } = useActiveWorkspaceRuns()
  const { data: agents = [] } = useAgentDefinitions()
  const session = useRef(createActivitySession()).current
  const listRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [flash, setFlash] = useState<Extract<
    ActivityHeaderPresentation,
    { kind: 'complete' }
  > | null>(null)

  const runs = data?.runs ?? []
  const recent = data?.recent ?? []
  session.noteActive(runs.map((run) => run.id))
  const presentation = headerPresentation(runs, recent, session)

  const flashKey = completeKey(presentation)

  useEffect(() => {
    if (presentation.kind !== 'complete') {
      setFlash(null)
      return
    }
    setFlash(presentation)
    const ids = presentation.runs.map((run) => run.id)
    const timer = window.setTimeout(() => {
      session.announce(ids)
      setFlash(null)
    }, FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [flashKey])

  const shown =
    presentation.kind === 'working'
      ? presentation
      : (flash ?? presentation)
  if (shown.kind === 'idle') return null

  const failed =
    shown.kind === 'complete' &&
    shown.runs.some((run) => run.state === 'failed')
  const statusLabel = shown.label

  const moveFocus = (direction: 1 | -1) => {
    const items = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>(
        '[data-activity-row]',
      ) ?? []),
    ]
    if (!items.length) return
    const index = items.findIndex((item) => item === document.activeElement)
    const next = items[Math.max(0, Math.min(items.length - 1, index + direction))]
    next?.focus()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-events-auto h-7 max-w-[11rem] gap-1.5 px-2 text-xs tabular-nums"
            aria-label={statusLabel}
            title={statusLabel}
          />
        }
      >
        {shown.kind === 'working' ? (
          <AgentThinking
            variant="spin"
            label={shown.label}
            className="max-w-full text-xs font-medium"
          />
        ) : failed ? (
          <>
            <CircleX className="size-3.5 text-destructive" aria-hidden="true" />
            <span className="truncate">{shown.label}</span>
          </>
        ) : (
          <>
            <Check className="size-3.5 text-green-500" aria-hidden="true" />
            <span className="truncate">{shown.label}</span>
          </>
        )}
        <span className="sr-only" aria-live="polite">
          {statusLabel}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-2"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            moveFocus(1)
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            moveFocus(-1)
          }
        }}
      >
        <p className="px-2 py-1.5 text-sm font-medium">Agents working</p>
        <div ref={listRef} className="max-h-80 space-y-0.5 overflow-y-auto">
          {runs.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No active runs
            </p>
          ) : (
            runs.map((run) => (
              <button
                key={run.id}
                type="button"
                data-activity-row=""
                className="flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-muted/40"
                onClick={() => {
                  onOpenActivity(run)
                  setOpen(false)
                }}
              >
                <AgentMark agentId={run.agentId} className="size-5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {agentNameFrom(agents, run.agentId)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {runStatus(run, run.latestStep)} · {contextLabel(run.context)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
