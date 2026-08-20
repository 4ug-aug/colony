import { cn } from '#/lib/utils'
import {
  Circle as CircleIcon,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Clock3,
} from 'lucide-react'
import { ISSUE_STATUSES, type IssuePriority, type IssueStatus } from '../types'

const statusIcon: Record<
  IssueStatus,
  { icon: typeof CircleIcon; className: string }
> = {
  backlog: { icon: CircleDashed, className: 'text-muted-foreground' },
  todo: { icon: CircleIcon, className: 'text-muted-foreground' },
  in_progress: { icon: CircleDot, className: 'text-yellow-500' },
  in_review: { icon: Clock3, className: 'text-green-500' },
  done: { icon: CircleCheck, className: 'text-indigo-500' },
}

function ringArc(start: number, fraction: number): string {
  const r = 5.5
  const sweep = Math.min(fraction, 0.9999) * 2 * Math.PI
  const from = start * 2 * Math.PI - Math.PI / 2
  const to = from + sweep
  const large = sweep > Math.PI ? 1 : 0
  return `M ${8 + r * Math.cos(from)} ${8 + r * Math.sin(from)} A ${r} ${r} 0 ${large} 1 ${8 + r * Math.cos(to)} ${8 + r * Math.sin(to)}`
}

export function ChildStatusRing({
  statuses,
  className,
}: {
  statuses: readonly IssueStatus[]
  className?: string
}) {
  const counts = ISSUE_STATUSES.flatMap((status) => {
    const count = statuses.filter((value) => value === status).length
    return count > 0 ? [{ status, count }] : []
  })
  const gap = counts.length > 1 ? 0.04 : 0
  const usable = 1 - gap * counts.length
  let start = 0

  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={cn('size-3.5 shrink-0', className)}
    >
      <path
        d={ringArc(0, 0.9999)}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-border"
      />
      {statuses.length > 0
        ? counts.map(({ status, count }) => {
            const fraction = (count / statuses.length) * usable
            const d = ringArc(start, fraction)
            start += fraction + gap
            return (
              <path
                key={status}
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className={statusIcon[status].className}
              />
            )
          })
        : null}
    </svg>
  )
}

export function IssueStatusIcon({
  status,
  className,
}: {
  status: IssueStatus
  className?: string
}) {
  const { icon: Icon, className: color } = statusIcon[status]
  return (
    <Icon
      width={14}
      height={14}
      className={cn('size-3.5 shrink-0', color, className)}
    />
  )
}

export function IssuePriorityIcon({
  priority,
  className,
}: {
  priority: IssuePriority
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={cn('size-4 shrink-0 text-muted-foreground', className)}
    >
      {priority === 'none' ? (
        <>
          <rect
            x="1.5"
            y="7.25"
            width="3"
            height="1.5"
            rx="0.5"
            opacity="0.9"
          />
          <rect
            x="6.5"
            y="7.25"
            width="3"
            height="1.5"
            rx="0.5"
            opacity="0.9"
          />
          <rect
            x="11.5"
            y="7.25"
            width="3"
            height="1.5"
            rx="0.5"
            opacity="0.9"
          />
        </>
      ) : priority === 'urgent' ? (
        <path d="M3 1C1.91067 1 1 1.91067 1 3V13C1 14.0893 1.91067 15 3 15H13C14.0893 15 15 14.0893 15 13V3C15 1.91067 14.0893 1 13 1H3ZM7 4H9L8.75391 8.99836H7.25L7 4ZM9 11C9 11.5523 8.55228 12 8 12C7.44772 12 7 11.5523 7 11C7 10.4477 7.44772 10 8 10C8.55228 10 9 10.4477 9 11Z" />
      ) : (
        <>
          <rect x="1.5" y="8" width="3" height="6" rx="1" />
          <rect
            x="6.5"
            y="5"
            width="3"
            height="9"
            rx="1"
            fillOpacity={priority === 'low' ? 0.4 : 1}
          />
          <rect
            x="11.5"
            y="2"
            width="3"
            height="12"
            rx="1"
            fillOpacity={priority === 'high' ? 1 : 0.4}
          />
        </>
      )}
    </svg>
  )
}
