import { Markdown } from '#/components/markdown'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import {
  Questionnaire,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireItem,
} from '#/components/ui/questionnaire'
import { Textarea } from '#/components/ui/textarea'
import { toast } from '#/components/ui/toast'
import { cn } from '#/lib/utils'
import { Check, MousePointerClick } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  GRILL_OTHER_VALUE,
  isAnswerComplete,
  isOtherAnswer,
  otherDraftText,
} from './grill-answers'
import { grillEnterClassName, grillStepLabel } from './grill-presentation'
import { grillAwaitingWrapUpReview, grillIsComplete } from './grill-status'
import type { Grill, GrillLatestStep, GrillLinkedRun, GrillQuestion } from './types'
import type { useGrillRealtime } from './use-grills'
import {
  grillTurnActive,
  useReplyToGrill,
  useSubmitGrillRound,
} from './use-grills'

function AgentNotes({
  steps,
  className,
}: {
  steps: GrillLatestStep[]
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const [fade, setFade] = useState({ top: false, bottom: false })

  const updateFade = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const top = element.scrollTop > 1
    const bottom =
      element.scrollHeight - element.scrollTop - element.clientHeight > 1
    setFade((current) =>
      current.top === top && current.bottom === bottom
        ? current
        : { top, bottom },
    )
  }, [])

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    if (followLatest.current) element.scrollTop = element.scrollHeight
    updateFade()
    const observer = new ResizeObserver(updateFade)
    observer.observe(element)
    return () => observer.disconnect()
  }, [steps, updateFade])

  return (
    <section className={cn('flex min-h-0 flex-col space-y-2', className)}>
      <h2 className="shrink-0 text-sm font-semibold">Agent notes</h2>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="h-full space-y-3 overflow-y-auto pr-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          onScroll={() => {
            const element = scrollRef.current
            if (!element) return
            followLatest.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              8
            updateFade()
          }}
        >
          {steps.map((step, index) => (
            <Markdown key={`${step.at}:${index}`}>{step.text}</Markdown>
          ))}
        </div>
        {fade.top ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-background to-transparent" />
        ) : null}
        {fade.bottom ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
        ) : null}
      </div>
    </section>
  )
}

function hasChoices(
  question: GrillQuestion,
): question is GrillQuestion & {
  choices: NonNullable<GrillQuestion['choices']>
} {
  return Boolean(question.choices && question.choices.length >= 2)
}

export function GrillFrontierPanel({
  grill,
  linkedRun,
  latestStep,
  narration,
  realtime,
  toolbarEnd,
}: {
  grill: Grill
  linkedRun?: GrillLinkedRun
  latestStep?: GrillLatestStep
  narration: GrillLatestStep[]
  realtime: ReturnType<typeof useGrillRealtime>
  toolbarEnd?: HTMLElement | null
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

  const noteSteps =
    narration.length > 0
      ? narration
      : latestStep?.kind === 'message' && latestStep.text.trim()
        ? [latestStep]
        : []
  const agentNotes = noteSteps.length ? (
    <AgentNotes steps={noteSteps} className="min-h-0 flex-1" />
  ) : null

  const questions = grill.frontier.questions
  const missingAnswers = questions.some(
    (question) => !isAnswerComplete(drafts[question.id]),
  )
  const activeEditors = realtime.leases.map(
    ({ editor }) => editor.displayName || editor.name,
  )
  const canSubmit =
    questions.length > 0 &&
    !submitRound.isPending &&
    !missingAnswers &&
    realtime.leases.length === 0 &&
    realtime.connected

  const submitButton =
    questions.length > 0 ? (
      <div className="flex shrink-0 items-center gap-3">
        {!realtime.connected ? (
          <p className="text-xs text-muted-foreground">Reconnecting…</p>
        ) : activeEditors.length ? (
          <p className="max-w-56 truncate text-xs text-muted-foreground">
            Waiting for {activeEditors.join(', ')} to finish editing.
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
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
          disabled={!canSubmit}
        >
          <Check data-icon="inline-start" />
          {submitRound.isPending ? 'Submitting…' : 'Submit round'}
        </Button>
      </div>
    ) : null

  const submitPortal =
    submitButton && toolbarEnd
      ? createPortal(submitButton, toolbarEnd)
      : null

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
    const canReply =
      !working && !replyToGrill.isPending && Boolean(reply.trim())
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        {submitPortal}
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col space-y-3 rounded-lg border border-dashed p-6',
            grillEnterClassName,
          )}
        >
          {working ? (
            <div className="flex min-h-0 flex-1 flex-col space-y-2">
              <BrailleLoader
                loader="wave-rows"
                text={activity}
                className="shrink-0 text-sm [&_span:last-child]:truncate"
              />
              {agentNotes ?? (
                <p className="text-xs text-muted-foreground">
                  Waiting for the grilling agent to publish this round&apos;s
                  frontier…
                </p>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col space-y-2">
              {agentNotes ?? (
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
              <div className="mt-auto space-y-2">
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
      </div>
    )
  }

  const setAnswer = (questionId: string, value: string) => {
    setDrafts((current) => ({ ...current, [questionId]: value }))
    realtime.change(questionId, value)
  }

  return (
    <div key={questionsKey} className="flex h-full min-h-0 flex-col gap-3">
      {submitPortal}
      {agentNotes ?? <div className="min-h-0 flex-1" />}
      <div className="max-h-[55%] shrink-0 space-y-4 overflow-y-auto bg-background pt-3 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
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
          const selected = drafts[question.id] ?? ''
          const choices = hasChoices(question) ? question.choices : undefined
          const otherActive = choices ? isOtherAnswer(question, selected) : false
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
              {choices ? (
                <div className="space-y-2">
                  <Questionnaire
                    className={cn(blocked && 'opacity-80')}
                    items={[
                      {
                        name: question.id,
                        required: true,
                        choices: [
                          ...choices.map((choice) => ({ value: choice.id })),
                          { value: GRILL_OTHER_VALUE },
                        ],
                      },
                    ]}
                    onSubmit={(event) => event.preventDefault()}
                  >
                    <QuestionnaireItem name={question.id} required>
                      <QuestionnaireChoices>
                        {choices.map((choice) => {
                          const isRecommended =
                            question.recommendedChoiceId === choice.id
                          return (
                            <QuestionnaireChoice
                              key={choice.id}
                              value={choice.id}
                              checked={selected === choice.id}
                              recommended={isRecommended}
                              disabled={!realtime.connected || blocked}
                              onChange={() => {
                                if (!realtime.connected || blocked) return
                                setAnswer(question.id, choice.id)
                                // Drop an Other-field lease so choice votes don't
                                // leave "editing" lit next to Submit.
                                if (mine) realtime.blur(question.id)
                              }}
                            >
                              <span className="flex w-full min-w-0 items-baseline justify-between gap-2">
                                <span className="font-medium">{choice.label}</span>
                                {isRecommended ? (
                                  <span className="shrink-0 text-[0.625rem] font-medium text-amber-700 dark:text-amber-400">
                                    Recommended
                                  </span>
                                ) : null}
                              </span>
                              {choice.description ? (
                                <QuestionnaireChoiceDescription>
                                  {choice.description}
                                </QuestionnaireChoiceDescription>
                              ) : null}
                            </QuestionnaireChoice>
                          )
                        })}
                        <QuestionnaireChoice
                          value={GRILL_OTHER_VALUE}
                          checked={otherActive}
                          disabled={!realtime.connected || blocked}
                          onChange={() => {
                            if (!realtime.connected || blocked) return
                            realtime.focus(question.id)
                            if (!otherActive)
                              setAnswer(question.id, GRILL_OTHER_VALUE)
                            queueMicrotask(() => {
                              textareas.current[question.id]?.focus()
                            })
                          }}
                        >
                          <span className="font-medium">Other</span>
                          <QuestionnaireChoiceDescription>
                            Write your own answer
                          </QuestionnaireChoiceDescription>
                        </QuestionnaireChoice>
                      </QuestionnaireChoices>
                    </QuestionnaireItem>
                  </Questionnaire>
                  {otherActive ? (
                    <Textarea
                      ref={(node) => {
                        textareas.current[question.id] = node
                      }}
                      value={otherDraftText(selected)}
                      readOnly={!realtime.connected || !mine}
                      className={cn(
                        blocked &&
                          'border-amber-500/70 ring-2 ring-amber-500/25',
                      )}
                      onFocus={() => realtime.focus(question.id)}
                      onChange={(event) => {
                        const value = event.target.value
                        setAnswer(
                          question.id,
                          value.trim() ? value : GRILL_OTHER_VALUE,
                        )
                      }}
                      onBlur={() => realtime.blur(question.id)}
                      placeholder="Your shared answer"
                      rows={3}
                    />
                  ) : null}
                </div>
              ) : (
                <>
                  {recommendation ? (
                    <button
                      type="button"
                      className="w-full rounded-md border border-dashed px-3 py-2 text-left transition-colors hover:bg-muted/40"
                      disabled={!realtime.connected || blocked}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        textareas.current[question.id]?.focus()
                        setAnswer(question.id, recommendation)
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
                    value={selected}
                    readOnly={!realtime.connected || !mine}
                    className={cn(
                      blocked && 'border-amber-500/70 ring-2 ring-amber-500/25',
                    )}
                    onFocus={() => realtime.focus(question.id)}
                    onChange={(event) => {
                      setAnswer(question.id, event.target.value)
                    }}
                    onBlur={() => realtime.blur(question.id)}
                    placeholder="Your shared answer"
                    rows={3}
                  />
                </>
              )}
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
      </div>
    </div>
  )
}
