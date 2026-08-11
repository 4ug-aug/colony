import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { BrailleLoader } from '#/components/ui/braille-loader'
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import { cn } from '#/lib/utils'
import { ArrowLeft, CheckCircle2, Flame } from 'lucide-react'
import { useState } from 'react'
import { DiscardGrillButton } from './discard-grill-button'
import { GrillFrontierPanel } from './grill-frontier-panel'
import {
  grillEnterAlertClassName,
  grillEnterClassName,
} from './grill-presentation'
import { ProposalPanel } from './grill-proposal-panel'
import { GrillSettledRounds } from './grill-settled-rounds'
import { grillAwaitingWrapUpReview, grillIsComplete } from './grill-status'
import { GrillWriteupPanel } from './grill-writeup-panel'
import { useGrill, useGrillRealtime } from './use-grills'

export function GrillSession({
  grillId,
  onOpenDoc,
}: {
  grillId: string
  onOpenDoc?: (docId: string) => void
}) {
  const { data, isPending, isError, error } = useGrill(grillId)
  const realtime = useGrillRealtime(grillId)
  // Must stay above early returns — loading→ready used to add this hook and
  // crash the whole app with "Rendered more hooks than during the previous render".
  const [toolbarEnd, setToolbarEnd] = useState<HTMLDivElement | null>(null)
  const grill = data?.grill
  const linkedRun = data?.linkedRun
  const latestStep = data?.latestStep
  const narration = data?.narration ?? []

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <BrailleLoader text="Loading Grill…" />
      </div>
    )
  }
  if (isError || !grill) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Grill not found'}
        </p>
      </div>
    )
  }

  const complete = grillIsComplete(grill)
  const awaitingWrapUp = grillAwaitingWrapUpReview(grill)
  const focusWrapUp = complete || awaitingWrapUp

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            Participating
          </span>
          <AvatarGroup>
            {realtime.participants.map((participant) => {
              const name = participant.displayName || participant.name
              const label =
                participant.displayName &&
                participant.displayName !== participant.name
                  ? `${name} (${participant.name})`
                  : name
              return (
                <Tooltip key={participant.id}>
                  <TooltipTrigger
                    render={
                      <Avatar size="sm">
                        {participant.image ? (
                          <AvatarImage
                            src={participant.image}
                            alt=""
                            className="border-1 hover:border-foreground"
                          />
                        ) : null}
                        <AvatarFallback className="border-1 hover:border-foreground">
                          {name.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                        <AvatarBadge className="bg-emerald-500" />
                      </Avatar>
                    }
                  />
                  <TooltipContent side="bottom">{label}</TooltipContent>
                </Tooltip>
              )
            })}
          </AvatarGroup>
        </div>
        {!focusWrapUp ? <div ref={setToolbarEnd} className="shrink-0" /> : null}
      </div>
      <div
        className={cn(
          'grid min-h-0 flex-1 gap-6 p-4 transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none',
          focusWrapUp
            ? 'content-start overflow-auto grid-cols-1'
            : 'overflow-hidden lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]',
        )}
      >
        {complete ? (
          <Alert
            key="complete"
            className={cn(
              grillEnterAlertClassName,
              'w-fit max-w-full self-start',
            )}
          >
            <CheckCircle2 />
            <AlertTitle>Complete</AlertTitle>
            <AlertDescription>
              This Grill is finished. Wrap-up artifacts and settled rounds are
              below.
            </AlertDescription>
          </Alert>
        ) : awaitingWrapUp ? (
          <Alert
            key="awaiting-wrap-up"
            className={cn(
              grillEnterAlertClassName,
              'w-fit max-w-full self-start',
            )}
          >
            <Flame />
            <AlertTitle>No open frontier</AlertTitle>
            <AlertDescription>
              Review the wrap-up below — confirm it or push it back.
            </AlertDescription>
          </Alert>
        ) : (
          <section
            key="frontier"
            className={cn('min-h-0', grillEnterClassName)}
          >
            <GrillFrontierPanel
              grill={grill}
              linkedRun={linkedRun}
              latestStep={latestStep}
              narration={narration}
              realtime={realtime}
              toolbarEnd={toolbarEnd}
            />
          </section>
        )}
        <div
          className={cn(
            'min-w-0 space-y-6',
            !focusWrapUp && 'min-h-0 overflow-auto',
          )}
        >
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Wrap-up</h2>
            {grill.kind === 'general' && (grill.writeup || grill.docId) ? (
              <GrillWriteupPanel grill={grill} onOpenDoc={onOpenDoc} />
            ) : null}
            {grill.issueProposal ? <ProposalPanel grill={grill} /> : null}
            {!grill.issueProposal &&
            !(grill.kind === 'general' && (grill.writeup || grill.docId)) ? (
              <p
                className={cn(
                  'text-sm text-muted-foreground',
                  grillEnterClassName,
                )}
              >
                {grill.kind === 'general'
                  ? 'When the design is settled, the agent proposes a Doc writeup here (and optionally an Issue tree).'
                  : 'When the agent proposes an Issue tree, confirm or push it back here.'}
              </p>
            ) : null}
          </section>
          {grill.settledAnswers.length > 0 ? (
            <GrillSettledRounds rounds={grill.settledAnswers} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function GrillSessionHeader({
  grillId,
  onBack,
}: {
  grillId: string
  onBack: () => void
}) {
  const { data, isPending } = useGrill(grillId)
  const grill = data?.grill
  const { data: agents = [] } = useAgentDefinitions()
  const agentName =
    agents.find((agent) => agent.id === grill?.agentDefinitionId)?.name ??
    grill?.agentDefinitionId

  if (isPending || !grill) {
    return (
      <>
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          Grills
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          Loading Grill…
        </p>
      </>
    )
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" />
        Grills
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {grill.kind === 'code' ? 'Code Grill' : 'General Grill'}
          {agentName ? ` with ${agentName}` : ''}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {grill.initialRequest?.trim() ||
            [
              grill.visibility === 'workspace-open'
                ? 'Workspace open'
                : 'Invite only',
              grill.baseRef ? `base ${grill.baseRef}` : undefined,
            ]
              .filter(Boolean)
              .join(', ')}
        </p>
      </div>
      <DiscardGrillButton grillId={grill.id} onDiscarded={onBack} />
    </>
  )
}
