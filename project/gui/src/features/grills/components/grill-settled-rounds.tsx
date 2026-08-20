import { Markdown } from '#/components/markdown'
import { Badge } from '#/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import { cn } from '#/lib/utils'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { formatSettledAnswer } from '../grill-answers'
import { grillEnterClassName } from '../grill-presentation'
import type { SettledRound } from '../types'

const collapsiblePanelClassName =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out motion-reduce:transition-none data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 [&[hidden]:not([hidden='until-found'])]:hidden"

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
      .map((question) =>
        formatSettledAnswer(question, round.answers[question.id]),
      )
      .find((answer) => answer !== '—') ?? 'No answers'

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
                {formatSettledAnswer(question, round.answers[question.id])}
              </p>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function GrillSettledRounds({ rounds }: { rounds: SettledRound[] }) {
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
