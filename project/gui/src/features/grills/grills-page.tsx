import { Badge } from '#/components/ui/badge'
import { BrailleLoader } from '#/components/ui/braille-loader'
import type { RunState } from '#/features/runs/run-helpers'
import { Flame } from 'lucide-react'
import { useState } from 'react'
import { DiscardGrillButton } from './discard-grill-button'
import { grillStepLabel } from './grill-presentation'
import { GrillSession } from './grill-session'
import { grillAwaitingWrapUpReview, grillIsComplete } from './grill-status'
import { StartGrillDialog } from './start-grill-dialog'
import type { GrillListItem } from './types'
import { grillTurnActive, useGrills } from './use-grills'

export { GrillSessionHeader } from './grill-session'

function GrillListActivity({ grill }: { grill: GrillListItem }) {
  const linkedRun = grill.linkedRun
  const awaitingAnswers = grill.frontier.questions.length > 0
  const openCount = grill.frontier.questions.length

  if (awaitingAnswers) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {openCount} open
        <Badge variant="secondary">your turn</Badge>
      </span>
    )
  }

  if (grillAwaitingWrapUpReview(grill)) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant="secondary">your turn</Badge>
      </span>
    )
  }

  if (grillIsComplete(grill)) {
    return (
      <span className="shrink-0 text-xs text-muted-foreground">complete</span>
    )
  }

  const state = linkedRun?.state as RunState | undefined
  const failed = state === 'failed' || state === 'cancelled'
  const agentWorking = !failed && grillTurnActive({ linkedRun })

  if (agentWorking) {
    const status = grill.latestStep
      ? grillStepLabel(grill.latestStep)
      : state === 'preparing'
        ? 'is preparing'
        : 'waiting for frontier'
    return (
      <BrailleLoader
        loader="wave-rows"
        text={status}
        className="shrink-0 max-w-[11rem] text-xs [&_span:last-child]:truncate"
      />
    )
  }

  if (failed) {
    const error = linkedRun?.error?.trim() || state
    return (
      <span
        className="min-w-0 max-w-[11rem] shrink truncate text-xs text-destructive"
        title={error}
      >
        {error}
      </span>
    )
  }

  return (
    <span className="shrink-0 text-xs text-muted-foreground">
      {grill.settledAnswers.length} settled
    </span>
  )
}

export function GrillsPage({
  startOpen = false,
  onStartOpenChange,
  selectedId,
  onSelectedIdChange,
  onOpenDoc,
}: {
  startOpen?: boolean
  onStartOpenChange?: (open: boolean) => void
  selectedId?: string
  onSelectedIdChange?: (id: string | undefined) => void
  onOpenDoc?: (docId: string) => void
}) {
  const { data: grills = [], isPending, isError, error } = useGrills()
  const [internalSelectedId, setInternalSelectedId] = useState<string>()
  const selectedControlled = onSelectedIdChange !== undefined
  const activeId = selectedControlled ? selectedId : internalSelectedId
  const setActiveId = selectedControlled
    ? onSelectedIdChange
    : setInternalSelectedId
  const [internalStartOpen, setInternalStartOpen] = useState(false)
  const startOpenControlled = onStartOpenChange !== undefined
  const dialogOpen = startOpenControlled ? startOpen : internalStartOpen
  const setDialogOpen = startOpenControlled
    ? onStartOpenChange
    : setInternalStartOpen

  if (activeId) {
    return <GrillSession grillId={activeId} onOpenDoc={onOpenDoc} />
  }

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <BrailleLoader text="Loading Grills…" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Unable to load Grills'}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        {grills.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Flame className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No active Grills</p>
              <p className="text-sm text-muted-foreground">
                Use Enter the Grill in the header to start one.
              </p>
            </div>
          </div>
        ) : (
          <ul className="mx-auto grid max-w-4xl gap-2">
            {grills.map((grill) => (
              <li key={grill.id}>
                <div className="flex items-stretch gap-1 rounded-lg border transition-colors hover:bg-muted/40">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start justify-between gap-3 px-4 py-3 text-left"
                    onClick={() => setActiveId(grill.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {grill.initialRequest?.trim() ||
                          (grill.kind === 'code'
                            ? 'Code Grill'
                            : 'General Grill')}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="font-normal">
                          {grill.kind === 'code' ? 'Code' : 'General'}
                        </Badge>
                        <Badge variant="secondary" className="font-normal">
                          {grill.visibility === 'workspace-open'
                            ? 'Workspace open'
                            : 'Invite only'}
                        </Badge>
                        {grill.issueProposal ? (
                          <Badge variant="outline" className="font-normal">
                            proposal {grill.issueProposal.status}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <GrillListActivity grill={grill} />
                  </button>
                  <div className="flex shrink-0 items-start p-2">
                    <DiscardGrillButton
                      grillId={grill.id}
                      size="icon-sm"
                      stopPropagation
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <StartGrillDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onStarted={(grill) => setActiveId(grill.id)}
      />
    </div>
  )
}
