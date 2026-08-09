import { Markdown } from '#/components/markdown'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { toast } from '#/components/ui/toast'
import { cn } from '#/lib/utils'
import { MousePointerClick } from 'lucide-react'
import { useState } from 'react'
import { grillEnterClassName, grillStepLabel } from './grill-presentation'
import { grillAwaitingWrapUpReview, grillIsComplete } from './grill-status'
import type { Grill, GrillLatestStep, GrillLinkedRun } from './types'
import {
  grillTurnActive,
  useReplyToGrill,
  useSubmitGrillRound,
  useUpdateGrillDrafts,
} from './use-grills'

export function GrillFrontierPanel({
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
            className={cn(
              'space-y-2 rounded-lg border p-4',
              grillEnterClassName,
            )}
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
