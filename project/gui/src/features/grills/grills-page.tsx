import { Badge } from '#/components/ui/badge'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import { toast } from '#/components/ui/toast'
import { Markdown } from '#/components/markdown'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import type { RunState } from '#/features/runs/run-helpers'
import { stepLabel } from '#/features/runs/step-label'
import { cn } from '#/lib/utils'
import { ArrowLeft, ChevronDown, Flame, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type {
  Grill,
  GrillKind,
  GrillLatestStep,
  GrillLinkedRun,
  GrillListItem,
  GrillVisibility,
  SettledRound,
} from './types'
import {
  useConfirmGrillProposal,
  useCreateGrill,
  useDiscardGrill,
  useGrill,
  useGrills,
  usePushBackGrillProposal,
  useSubmitGrillRound,
  useUpdateGrillDrafts,
} from './use-grills'

function StartGrillDialog({
  open,
  onOpenChange,
  onStarted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted: (grill: Grill) => void
}) {
  const { data: agents = [] } = useAgentDefinitions()
  const createGrill = useCreateGrill()
  const grillAgents = agents.filter((agent) => agent.skills.length > 0)
  const [kind, setKind] = useState<GrillKind>('general')
  const [visibility, setVisibility] =
    useState<GrillVisibility>('workspace-open')
  const [agentDefinitionId, setAgentDefinitionId] = useState('')
  const [baseRef, setBaseRef] = useState('main')
  const [initialRequest, setInitialRequest] = useState('')

  const selectedAgent =
    agentDefinitionId || grillAgents[0]?.id || ''

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!selectedAgent) {
      toast.add({ title: 'Pick an agent with an attached Skill', type: 'error' })
      return
    }
    if (!initialRequest.trim()) {
      toast.add({
        title: 'Describe what you want to grill',
        type: 'error',
      })
      return
    }
    void createGrill
      .mutateAsync({
        kind,
        visibility,
        agentDefinitionId: selectedAgent,
        initialRequest: initialRequest.trim(),
        ...(kind === 'code' ? { baseRef: baseRef.trim() || 'main' } : {}),
      })
      .then((detail) => {
        onOpenChange(false)
        setInitialRequest('')
        onStarted(detail.grill)
      })
      .catch((reason) => {
        toast.add({
          title:
            reason instanceof Error ? reason.message : 'Unable to start Grill',
          type: 'error',
        })
      })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Enter the Grill</DialogTitle>
            <DialogDescription>
              Start from a design request. Round answers advance only when you
              submit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              What are we grilling?
              <Textarea
                value={initialRequest}
                onChange={(event) => setInitialRequest(event.target.value)}
                placeholder="We are going to design X feature…"
                rows={3}
                required
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Kind
              <Select
                value={kind}
                onValueChange={(value) => {
                  if (value === 'code' || value === 'general') setKind(value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Grill</SelectItem>
                  <SelectItem value="code">Code Grill</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Visibility
              <Select
                value={visibility}
                onValueChange={(value) => {
                  if (value === 'invite-only' || value === 'workspace-open')
                    setVisibility(value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace-open">Workspace open</SelectItem>
                  <SelectItem value="invite-only">Invite only</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Grilling agent
              <Select
                value={selectedAgent}
                onValueChange={(value) => {
                  if (typeof value === 'string') setAgentDefinitionId(value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {grillAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {kind === 'code' && (
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Base ref
                <Input
                  value={baseRef}
                  onChange={(event) => setBaseRef(event.target.value)}
                  placeholder="main"
                />
              </label>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createGrill.isPending}>
              {createGrill.isPending ? 'Starting…' : 'Start Grill'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function grillStepLabel(step: GrillLatestStep): string {
  return stepLabel({
    id: 'latest',
    runId: 'grill',
    roomId: 'grill',
    idx: 0,
    kind: step.kind,
    ...(step.tool !== undefined ? { tool: step.tool } : {}),
    text: step.text,
    createdAt: step.at,
  })
}

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

  const state = linkedRun?.state as RunState | undefined
  const failed = state === 'failed' || state === 'cancelled'
  const agentWorking =
    !failed && (state === 'preparing' || state === 'running')

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

function AgentStatusStrip({
  agentName,
  linkedRun,
  latestStep,
  awaitingAnswers,
}: {
  agentName: string
  linkedRun?: GrillLinkedRun
  latestStep?: GrillLatestStep
  awaitingAnswers: boolean
}) {
  if (!linkedRun) return null
  const state = linkedRun.state as RunState
  const failed = state === 'failed' || state === 'cancelled'
  // Warm Grill runs stay "running" while idle; frontier presence means Accounts' turn.
  if (awaitingAnswers) return null
  const agentWorking =
    !failed && (state === 'preparing' || state === 'running')

  if (agentWorking) {
    const status = latestStep
      ? grillStepLabel(latestStep)
      : state === 'preparing'
        ? 'is preparing'
        : 'is working'
    return (
      <div className="flex min-w-0 items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
        <BrailleLoader
          loader="wave-rows"
          text={`${agentName} ${status}`}
          className="min-w-0 [&_span:last-child]:truncate"
        />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 border-b px-4 py-2 text-xs text-muted-foreground">
      <span className="shrink-0 font-medium text-foreground">{agentName}</span>
      {failed ? (
        <span
          className="min-w-0 truncate text-destructive"
          title={linkedRun.error?.trim() || state}
        >
          {linkedRun.error?.trim() || state}
        </span>
      ) : (
        <span>is idle</span>
      )}
    </div>
  )
}

function FrontierPanel({
  grill,
  linkedRun,
  latestStep,
}: {
  grill: Grill
  linkedRun?: GrillLinkedRun
  latestStep?: GrillLatestStep
}) {
  const updateDrafts = useUpdateGrillDrafts(grill.id)
  const submitRound = useSubmitGrillRound(grill.id)
  const [drafts, setDrafts] = useState(grill.frontier.drafts)
  const frontierKey = `${grill.id}:${grill.frontier.questions.map((q) => q.id).join(',')}:${grill.updatedAt}`
  const [syncedKey, setSyncedKey] = useState(frontierKey)
  if (syncedKey !== frontierKey) {
    setSyncedKey(frontierKey)
    setDrafts(grill.frontier.drafts)
  }

  const questions = grill.frontier.questions
  if (questions.length === 0) {
    const runState = linkedRun?.state
    const failed = runState === 'failed' || runState === 'cancelled'
    const working =
      !failed &&
      (runState === undefined ||
        runState === 'preparing' ||
        runState === 'running')
    const activity = latestStep
      ? grillStepLabel(latestStep)
      : runState === 'preparing'
        ? 'is preparing'
        : 'is working'
    return (
      <div className="space-y-3 rounded-lg border border-dashed p-6">
        {working ? (
          <div className="space-y-2">
            <BrailleLoader
              loader="wave-rows"
              text={activity}
              className="text-sm [&_span:last-child]:truncate"
            />
            <p className="text-xs text-muted-foreground">
              Waiting for the grilling agent to publish this round&apos;s
              frontier…
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            The grilling agent finished without publishing a frontier.
          </p>
        )}
        {failed && (
          <p
            className="truncate text-sm text-destructive"
            title={
              linkedRun?.error?.trim() ||
              'Grill-linked run failed before publishing a frontier.'
            }
          >
            {linkedRun?.error?.trim() ||
              'Grill-linked run failed before publishing a frontier.'}
          </p>
        )}
      </div>
    )
  }

  const missingAnswers = questions.some(
    (question) => !(drafts[question.id] ?? '').trim(),
  )

  return (
    <div className="space-y-4">
      {questions.map((question) => {
        const recommendation = question.recommendation?.trim()
        return (
          <div key={question.id} className="space-y-2 rounded-lg border p-4">
            <Markdown>{question.prompt}</Markdown>
            {recommendation ? (
              <button
                type="button"
                className="w-full rounded-md border border-dashed px-3 py-2 text-left transition-colors hover:bg-muted/40"
                onClick={() => {
                  const next = {
                    ...drafts,
                    [question.id]: recommendation,
                  }
                  setDrafts(next)
                  void updateDrafts.mutateAsync(next).catch((reason) => {
                    toast.add({
                      title:
                        reason instanceof Error
                          ? reason.message
                          : 'Unable to save drafts',
                      type: 'error',
                    })
                  })
                }}
              >
                <p className="text-xs font-medium text-muted-foreground">
                  Recommendation — click to use
                </p>
                <p className="mt-1 text-sm">{recommendation}</p>
              </button>
            ) : null}
            <Textarea
              value={drafts[question.id] ?? ''}
              onChange={(event) => {
                const value = event.target.value
                setDrafts((current) => ({ ...current, [question.id]: value }))
              }}
              onBlur={(event) => {
                const next = {
                  ...drafts,
                  [question.id]: event.target.value,
                }
                setDrafts(next)
                void updateDrafts.mutateAsync(next).catch((reason) => {
                  toast.add({
                    title:
                      reason instanceof Error
                        ? reason.message
                        : 'Unable to save drafts',
                    type: 'error',
                  })
                })
              }}
              placeholder="Your shared answer"
              rows={3}
            />
          </div>
        )
      })}
      <Button
        type="button"
        onClick={() => {
          if (missingAnswers || submitRound.isPending) {
            if (missingAnswers) {
              toast.add({
                title: 'Answer every frontier question before submitting',
                type: 'error',
              })
            }
            return
          }
          void submitRound.mutateAsync(drafts).catch((reason) => {
            toast.add({
              title:
                reason instanceof Error
                  ? reason.message
                  : 'Unable to submit round',
              type: 'error',
            })
          })
        }}
        disabled={submitRound.isPending || missingAnswers}
      >
        {submitRound.isPending ? 'Submitting…' : 'Submit round'}
      </Button>
    </div>
  )
}

function ProposalPanel({ grill }: { grill: Grill }) {
  const proposal = grill.issueProposal
  const pushBack = usePushBackGrillProposal(grill.id)
  const confirm = useConfirmGrillProposal(grill.id)
  const [notes, setNotes] = useState('')
  if (!proposal) return null

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Issue proposal</h3>
        <span className="text-xs text-muted-foreground">{proposal.status}</span>
      </div>
      {proposal.revisionNotes && (
        <p className="text-xs text-muted-foreground">
          Revision notes: {proposal.revisionNotes}
        </p>
      )}
      <ul className="space-y-2">
        {proposal.issues.map((issue) => (
          <li key={issue.key} className="rounded-md bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">{issue.title}</p>
            {issue.description && (
              <p className="text-muted-foreground">{issue.description}</p>
            )}
            {issue.parentKey && (
              <p className="text-xs text-muted-foreground">
                child of {issue.parentKey}
              </p>
            )}
          </li>
        ))}
      </ul>
      {proposal.status !== 'confirmed' && (
        <div className="space-y-2">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Revision notes for push-back"
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pushBack.isPending || !notes.trim()}
              onClick={() => {
                void pushBack
                  .mutateAsync(notes.trim())
                  .then(() => setNotes(''))
                  .catch((reason) => {
                    toast.add({
                      title:
                        reason instanceof Error
                          ? reason.message
                          : 'Unable to push back',
                      type: 'error',
                    })
                  })
              }}
            >
              Push back
            </Button>
            <Button
              type="button"
              disabled={confirm.isPending}
              onClick={() => {
                void confirm.mutateAsync().catch((reason) => {
                  toast.add({
                    title:
                      reason instanceof Error
                        ? reason.message
                        : 'Unable to confirm',
                    type: 'error',
                  })
                })
              }}
            >
              Confirm Issues
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

const collapsiblePanelClassName =
  'h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out motion-reduce:transition-none data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 [&[hidden]:not([hidden=\'until-found\'])]:hidden'

function SettledRoundRow({
  round,
  index,
  open,
  onOpenChange,
}: {
  round: SettledRound
  index: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const preview =
    round.questions
      .map((question) => round.answers[question.id]?.trim())
      .find(Boolean) ?? 'No answers'

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
          />
        }
      >
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none',
            !open && '-rotate-90',
          )}
          aria-hidden
        />
        <span className="shrink-0 text-sm font-medium">Round {index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {preview}
        </span>
        <Badge variant="outline" className="shrink-0 font-normal">
          {round.questions.length}{' '}
          {round.questions.length === 1 ? 'answer' : 'answers'}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className={collapsiblePanelClassName}>
        <div className="space-y-3 px-3 pb-3 text-sm">
          {round.questions.map((question) => (
            <div key={question.id} className="space-y-1">
              <Markdown>{question.prompt}</Markdown>
              <p className="text-foreground">
                {round.answers[question.id] ?? '—'}
              </p>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function SettledRoundsList({ rounds }: { rounds: SettledRound[] }) {
  const latestIndex = rounds.length - 1
  const [openIndex, setOpenIndex] = useState(latestIndex)
  const [syncedLatest, setSyncedLatest] = useState(latestIndex)
  if (syncedLatest !== latestIndex) {
    setSyncedLatest(latestIndex)
    setOpenIndex(latestIndex)
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Settled rounds</h2>
      <div className="overflow-hidden rounded-lg border">
        <ul className="divide-y">
          {rounds.map((round, index) => (
            <li key={index}>
              <SettledRoundRow
                round={round}
                index={index}
                open={openIndex === index}
                onOpenChange={(next) => setOpenIndex(next ? index : -1)}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function GrillSession({ grillId }: { grillId: string }) {
  const { data, isPending, isError, error } = useGrill(grillId)
  const grill = data?.grill
  const linkedRun = data?.linkedRun
  const latestStep = data?.latestStep
  const { data: agents = [] } = useAgentDefinitions()
  const agentName =
    agents.find((agent) => agent.id === grill?.agentDefinitionId)?.name ??
    grill?.agentDefinitionId

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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AgentStatusStrip
        agentName={agentName ?? 'Agent'}
        linkedRun={linkedRun}
        latestStep={latestStep}
        awaitingAnswers={grill.frontier.questions.length > 0}
      />
      <div className="grid flex-1 gap-6 overflow-auto p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Frontier</h2>
          <FrontierPanel
            grill={grill}
            linkedRun={linkedRun}
            latestStep={latestStep}
          />
        </section>
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Wrap-up</h2>
            {grill.issueProposal ? (
              <ProposalPanel grill={grill} />
            ) : (
              <p className="text-sm text-muted-foreground">
                When the agent proposes an Issue tree, confirm or push it back
                here.
              </p>
            )}
          </section>
          {grill.settledAnswers.length > 0 ? (
            <SettledRoundsList rounds={grill.settledAnswers} />
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
  const discard = useDiscardGrill()
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
      <AlertDialog>
        <AlertDialogTrigger
          render={<Button type="button" size="sm" variant="ghost" />}
        >
          <Trash2 data-icon="inline-start" />
          Discard
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this Grill?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the session, settled rounds, and any
              linked agent run. Confirmed Issues are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={discard.isPending}
              onClick={() => {
                void discard
                  .mutateAsync(grill.id)
                  .then(onBack)
                  .catch((reason) => {
                    toast.add({
                      title:
                        reason instanceof Error
                          ? reason.message
                          : 'Unable to discard Grill',
                      type: 'error',
                    })
                  })
              }}
            >
              {discard.isPending ? 'Discarding…' : 'Discard'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function GrillsPage({
  startOpen = false,
  onStartOpenChange,
  selectedId,
  onSelectedIdChange,
}: {
  startOpen?: boolean
  onStartOpenChange?: (open: boolean) => void
  selectedId?: string
  onSelectedIdChange?: (id: string | undefined) => void
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
    return <GrillSession grillId={activeId} />
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
          <ul className="mx-auto grid max-w-2xl gap-2">
            {grills.map((grill) => (
              <li key={grill.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-start justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/40',
                  )}
                  onClick={() => setActiveId(grill.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {grill.initialRequest?.trim() ||
                        (grill.kind === 'code' ? 'Code Grill' : 'General Grill')}
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
