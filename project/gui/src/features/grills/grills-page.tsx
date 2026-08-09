import { Markdown } from '#/components/markdown'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '#/components/ui/alert'
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
import { Badge } from '#/components/ui/badge'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
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
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import { useDoc } from '#/features/docs/use-docs'
import type { RunState } from '#/features/runs/run-helpers'
import { stepLabel } from '#/features/runs/step-label'
import { cn } from '#/lib/utils'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Flame,
  MousePointerClick,
  Trash2,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ProposalPanel } from './grill-proposal-panel'
import {
  grillAwaitingWrapUpReview,
  grillIsComplete,
} from './grill-status'
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
  useCompleteGrill,
  useCreateGrill,
  useDiscardGrill,
  useGrill,
  useGrills,
  useReplyToGrill,
  useSubmitGrillRound,
  useUpdateGrillDrafts,
  grillTurnActive,
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

function DiscardGrillButton({
  grillId,
  onDiscarded,
  size = 'sm',
  stopPropagation,
}: {
  grillId: string
  onDiscarded?: () => void
  size?: 'sm' | 'icon-sm'
  stopPropagation?: boolean
}) {
  const discard = useDiscardGrill()

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            size={size}
            variant="ghost"
            aria-label="Discard Grill"
            onClick={
              stopPropagation
                ? (event) => event.stopPropagation()
                : undefined
            }
          />
        }
      >
        <Trash2 data-icon={size === 'sm' ? 'inline-start' : undefined} />
        {size === 'sm' ? 'Discard' : null}
      </AlertDialogTrigger>
      <AlertDialogContent
        onClick={
          stopPropagation ? (event) => event.stopPropagation() : undefined
        }
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Discard this Grill?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the session, settled rounds, and any linked
            agent run. Confirmed Issues and saved Docs are kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={discard.isPending}
            onClick={() => {
              void discard
                .mutateAsync(grillId)
                .then(() => {
                  onDiscarded?.()
                })
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
  )
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

const grillEnterClassName =
  'animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out fill-mode-both motion-reduce:animate-none'

const grillEnterAlertClassName =
  'animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out fill-mode-both motion-reduce:animate-none'

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
  const replyToGrill = useReplyToGrill(grill.id)
  const [drafts, setDrafts] = useState(grill.frontier.drafts)
  const [reply, setReply] = useState('')
  const frontierKey = `${grill.id}:${grill.frontier.questions.map((q) => q.id).join(',')}:${grill.updatedAt}`
  const [syncedKey, setSyncedKey] = useState(frontierKey)
  if (syncedKey !== frontierKey) {
    setSyncedKey(frontierKey)
    setDrafts(grill.frontier.drafts)
  }

  const questions = grill.frontier.questions
  if (questions.length === 0) {
    if (grillIsComplete(grill) || grillAwaitingWrapUpReview(grill)) return null
    const runState = linkedRun?.state
    const failed = runState === 'failed' || runState === 'cancelled'
    const working = !failed && grillTurnActive({ linkedRun })
    const activity = latestStep
      ? grillStepLabel(latestStep)
      : runState === 'preparing'
        ? 'is preparing'
        : 'is working'
    const messageText =
      latestStep?.kind === 'message' && latestStep.text.trim()
        ? latestStep.text
        : undefined
    const canReply =
      !working && !replyToGrill.isPending && Boolean(reply.trim())
    return (
      <div
        className={cn(
          'space-y-3 rounded-lg border border-dashed p-6',
          grillEnterClassName,
        )}
      >
        {working ? (
          <div className="space-y-2">
            <BrailleLoader
              loader="wave-rows"
              text={activity}
              className="text-sm [&_span:last-child]:truncate"
            />
            {messageText ? (
              <div className="max-h-48 overflow-auto rounded-md border bg-muted/20 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
                {messageText}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Waiting for the grilling agent to publish this round&apos;s
                frontier…
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {messageText ? (
              <div className="max-h-48 overflow-auto rounded-md border bg-muted/20 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
                {messageText}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {failed
                  ? 'The grilling agent finished without publishing a frontier.'
                  : 'No open frontier right now.'}
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
            <div className="space-y-2">
              <Textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Reply to the grilling agent…"
                rows={3}
                disabled={replyToGrill.isPending}
              />
              <Button
                type="button"
                disabled={!canReply}
                onClick={() => {
                  const message = reply.trim()
                  if (!message) return
                  void replyToGrill
                    .mutateAsync(message)
                    .then(() => setReply(''))
                    .catch((reason) => {
                      toast.add({
                        title:
                          reason instanceof Error
                            ? reason.message
                            : 'Unable to reply',
                        type: 'error',
                      })
                    })
                }}
              >
                {replyToGrill.isPending ? 'Sending…' : 'Send reply'}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const missingAnswers = questions.some(
    (question) => !(drafts[question.id] ?? '').trim(),
  )
  const questionsKey = questions.map((question) => question.id).join(',')

  return (
    <div key={questionsKey} className="space-y-4">
      {questions.map((question, index) => {
        const recommendation = question.recommendation?.trim()
        return (
          <div
            key={question.id}
            className={cn('space-y-2 rounded-lg border p-4', grillEnterClassName)}
            style={{ animationDelay: `${Math.min(index, 4) * 40}ms` }}
          >
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
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  Recommendation
                  <MousePointerClick
                    className="size-3.5 shrink-0"
                    aria-hidden
                  />
                  <span className="sr-only">Click to use</span>
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

function WriteupPanel({
  grill,
  onOpenDoc,
}: {
  grill: Grill
  onOpenDoc?: (docId: string) => void
}) {
  const writeup = grill.writeup
  const complete = useCompleteGrill(grill.id)
  const { data: doc, isPending: docPending } = useDoc(grill.docId)

  if (grill.docId) {
    return (
      <div className={cn('space-y-3 rounded-lg border p-4', grillEnterClassName)}>
        <h3 className="text-sm font-semibold">Doc saved</h3>
        {docPending && !doc ? (
          <p className="text-sm text-muted-foreground">Loading Doc…</p>
        ) : doc ? (
          <>
            <p className="text-base font-medium">
              {doc.title.trim() || 'Untitled Doc'}
            </p>
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <Markdown>{doc.body}</Markdown>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            This General Grill writeup is saved as a workspace Doc.
          </p>
        )}
        {onOpenDoc ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenDoc(grill.docId!)}
          >
            Open in Docs
          </Button>
        ) : null}
      </div>
    )
  }

  if (!writeup) return null

  return (
    <div className={cn('space-y-3 rounded-lg border p-4', grillEnterClassName)}>
      <h3 className="text-sm font-semibold">Doc writeup</h3>
      <p className="text-base font-medium">{writeup.title}</p>
      <div className="max-h-[min(28rem,50vh)] overflow-auto rounded-md border bg-muted/20 px-3 py-2 text-sm">
        <Markdown>{writeup.body}</Markdown>
      </div>
      <Button
        type="button"
        disabled={complete.isPending || !writeup.title.trim()}
        onClick={() => {
          void complete
            .mutateAsync({
              title: writeup.title.trim(),
              body: writeup.body,
            })
            .catch((reason) => {
              toast.add({
                title:
                  reason instanceof Error
                    ? reason.message
                    : 'Unable to complete Grill',
                type: 'error',
              })
            })
        }}
      >
        {complete.isPending ? 'Saving Doc…' : 'Complete & save Doc'}
      </Button>
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
            <div key={question.id} className="space-y-1.5">
              <div className="opacity-70">
                <Markdown>{question.prompt}</Markdown>
              </div>
              <p className="border-l-2 border-foreground/25 pl-3 text-foreground">
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
    <section className={cn('space-y-3', grillEnterClassName)}>
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

function GrillSession({
  grillId,
  onOpenDoc,
}: {
  grillId: string
  onOpenDoc?: (docId: string) => void
}) {
  const { data, isPending, isError, error } = useGrill(grillId)
  const grill = data?.grill
  const linkedRun = data?.linkedRun
  const latestStep = data?.latestStep

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
      <div
        className={cn(
          'grid flex-1 content-start gap-6 overflow-auto p-4 transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none',
          focusWrapUp
            ? 'grid-cols-1'
            : 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]',
        )}
      >
        {complete ? (
          <Alert
            key="complete"
            className={cn(grillEnterAlertClassName, 'w-fit max-w-full self-start')}
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
            className={cn(grillEnterAlertClassName, 'w-fit max-w-full self-start')}
          >
            <Flame />
            <AlertTitle>No open frontier</AlertTitle>
            <AlertDescription>
              Review the wrap-up below — confirm it or push it back.
            </AlertDescription>
          </Alert>
        ) : (
          <section key="frontier" className={cn('space-y-3', grillEnterClassName)}>
            <FrontierPanel
              grill={grill}
              linkedRun={linkedRun}
              latestStep={latestStep}
            />
          </section>
        )}
        <div className="min-w-0 space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Wrap-up</h2>
            {grill.kind === 'general' && (grill.writeup || grill.docId) ? (
              <WriteupPanel grill={grill} onOpenDoc={onOpenDoc} />
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
