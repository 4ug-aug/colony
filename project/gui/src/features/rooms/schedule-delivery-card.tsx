import { Markdown } from '#/components/markdown'
import { useDashboardStore } from '#/features/shell/dashboard-store'
import { cn } from '#/lib/utils'
import {
  ArrowUpRight,
  CalendarClock,
  CircleCheck,
  CircleDashed,
  OctagonX,
} from 'lucide-react'
import type { MessageDelivery } from './types'

const outcome = {
  succeeded: { label: 'Succeeded', icon: CircleCheck, tone: 'text-green-500' },
  failed: { label: 'Failed', icon: OctagonX, tone: 'text-destructive' },
  cancelled: {
    label: 'Cancelled',
    icon: CircleDashed,
    tone: 'text-muted-foreground',
  },
} as const

/** A Schedule run's outcome, delivered into a Chamber, rendered as that run. */
export function ScheduleDeliveryCard({
  delivery,
  text,
  mentions,
}: {
  delivery: Extract<MessageDelivery, { kind: 'schedule' }>
  text: string
  mentions: string[]
}) {
  const { label, icon: Icon, tone } = outcome[delivery.state]
  return (
    <div className="mt-1 max-w-xl overflow-hidden rounded-lg border bg-card animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none">
      <div className="flex h-9 items-center gap-2 border-b px-3">
        <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{delivery.name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Icon className={cn('size-3.5', tone)} />
          {label}
        </span>
      </div>
      <div className="px-3 pt-2 pb-1 text-sm">
        <Markdown mentions={mentions}>{text}</Markdown>
      </div>
      <div className="px-3 pt-1 pb-3">
        <button
          type="button"
          onClick={() =>
            useDashboardStore
              .getState()
              .navigate({ view: 'schedules', id: delivery.scheduleId })
          }
          className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted/60 px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
        >
          <CalendarClock className="size-3.5" />
          Open schedule
          <ArrowUpRight className="size-3" />
        </button>
      </div>
    </div>
  )
}
