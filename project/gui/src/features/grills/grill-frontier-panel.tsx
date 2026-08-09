import { Markdown } from '#/components/markdown'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { toast } from '#/components/ui/toast'
import { cn } from '#/lib/utils'
import { MousePointerClick } from 'lucide-react'
import { useRef, useState } from 'react'
import { grillEnterClassName, grillStepLabel } from './grill-presentation'
import { grillAwaitingWrapUpReview, grillIsComplete } from './grill-status'
import type { Grill, GrillLatestStep, GrillLinkedRun } from './types'
import type { useGrillRealtime } from './use-grills'
import {
  grillTurnActive,
  useReplyToGrill,
  useSubmitGrillRound,
} from './use-grills'

export function GrillFrontierPanel({
  grill,
  linkedRun,
  latestStep,
  realtime,
}: {
  grill: Grill
  linkedRun?: GrillLinkedRun
  latestStep?: GrillLatestStep
  realtime: ReturnType<typeof useGrillRealtime>
}) {
  const submitRound = useSubmitGrillRound(grill.id)
  const replyToGrill = useReplyToGrill(grill.id)
  const [drafts, setDrafts] = useState(grill.frontier.drafts)
  const [reply, setReply] = useState('')
  const textareas = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const questionsKey = grill.frontier.questions.map((q) => q.id).join(',')
  const frontierKey = `${grill.id}:${questionsKey}:${JSON.stringify(grill.frontier.drafts)}`
  const [synced, setSynced] = useState({
    key: frontierKey,
    questionsKey,
  })
  if (synced.key !== frontierKey) {
    setSynced({ key: frontierKey, questionsKey })
    if (synced.questionsKey !== questionsKey) {
      setDrafts(grill.frontier.drafts)
    } else {
      setDrafts((current) => {
        const next = { ...current }
        for (const [questionId, value] of Object.entries(
          grill.frontier.drafts,
        )) {
          const lease = realtime.leases.find(
            (item) => item.questionId === questionId,
          )
          if (lease?.presenceId !== realtime.presenceId)
            next[questionId] = value
        }
        return next
      })
    }
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
  const activeEditors = realtime.leases.map(
    ({ editor }) => editor.displayName || editor.name,
  )

  return (
    <div key={questionsKey} className="space-y-4">
      {questions.map((question, index) => {
        const recommendation = question.recommendation?.trim()
        const lease = realtime.leases.find(
          ({ questionId }) => questionId === question.id,
        )
        const mine = lease?.presenceId === realtime.presenceId
        const blocked = Boolean(lease && !mine)
        const editorName = lease
          ? lease.editor.displayName || lease.editor.name
          : ''
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
                disabled={!realtime.connected || Boolean(lease && !mine)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  textareas.current[question.id]?.focus()
                  const next = {
                    ...drafts,
                    [question.id]: recommendation,
                  }
                  setDrafts(next)
                  realtime.change(question.id, recommendation)
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
              ref={(node) => {
                textareas.current[question.id] = node
              }}
              value={drafts[question.id] ?? ''}
              readOnly={!realtime.connected || !mine}
              className={cn(
                blocked &&
                  'border-amber-500/70 ring-2 ring-amber-500/25',
              )}
              onFocus={() => realtime.focus(question.id)}
              onChange={(event) => {
                const value = event.target.value
                setDrafts((current) => ({ ...current, [question.id]: value }))
                realtime.change(question.id, value)
              }}
              onBlur={() => realtime.blur(question.id)}
              placeholder="Your shared answer"
              rows={3}
            />
            <div className="flex min-h-6 justify-end">
              {lease ? (
                <div
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  title={`${editorName} is editing`}
                >
                  <Avatar size="sm">
                    {lease.editor.image ? (
                      <AvatarImage src={lease.editor.image} alt="" />
                    ) : null}
                    <AvatarFallback>
                      {editorName.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span>
                    {mine ? 'You are editing' : `${editorName} is editing`}
                  </span>
                </div>
              ) : null}
            </div>
            {realtime.recoveries[question.id] ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                <p className="font-medium">Unsaved text from reconnect</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {realtime.recoveries[question.id]}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-1"
                  onClick={() => realtime.dismissRecovery(question.id)}
                >
                  Dismiss
                </Button>
              </div>
            ) : null}
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
        disabled={
          submitRound.isPending ||
          missingAnswers ||
          realtime.leases.length > 0 ||
          !realtime.connected
        }
      >
        {submitRound.isPending ? 'Submitting…' : 'Submit round'}
      </Button>
      {!realtime.connected ? (
        <p className="text-xs text-muted-foreground">Reconnecting…</p>
      ) : activeEditors.length ? (
        <p className="text-xs text-muted-foreground">
          Waiting for {activeEditors.join(', ')} to finish editing.
        </p>
      ) : null}
    </div>
  )
}
