import { cn } from '#/lib/utils'
import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Clock3,
  Minus,
  SignalHigh,
  SignalLow,
  SignalMedium,
  TriangleAlert,
} from 'lucide-react'
import type { IssuePriority, IssueStatus } from './types'

const priorityIcon: Record<
  IssuePriority,
  { icon: typeof Minus; className?: string }
> = {
  none: { icon: Minus, className: 'text-muted-foreground/70' },
  low: { icon: SignalLow, className: 'text-muted-foreground' },
  medium: { icon: SignalMedium, className: 'text-muted-foreground' },
  high: { icon: SignalHigh, className: 'text-orange-500' },
  urgent: { icon: TriangleAlert, className: 'text-red-500' },
}

const statusIcon: Record<
  IssueStatus,
  { icon: typeof Circle; className: string }
> = {
  backlog: { icon: CircleDashed, className: 'text-muted-foreground' },
  todo: { icon: Circle, className: 'text-muted-foreground' },
  in_progress: { icon: CircleDot, className: 'text-yellow-500' },
  in_review: { icon: Clock3, className: 'text-green-500' },
  done: { icon: CircleCheck, className: 'text-indigo-500' },
}

export function IssueStatusIcon({
  status,
  className,
}: {
  status: IssueStatus
  className?: string
}) {
  const { icon: Icon, className: color } = statusIcon[status]
  return <Icon className={cn('size-3.5 shrink-0', color, className)} />
}

export function IssuePriorityIcon({
  priority,
  className,
}: {
  priority: IssuePriority
  className?: string
}) {
  const { icon: Icon, className: color } = priorityIcon[priority]
  return <Icon className={cn('size-3.5 shrink-0', color, className)} />
}
