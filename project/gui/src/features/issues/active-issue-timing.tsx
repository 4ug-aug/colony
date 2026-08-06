import { Button } from '#/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { useQuery } from '@tanstack/react-query'
import { Square, Timer } from 'lucide-react'
import { useState } from 'react'
import { formatIssueId } from './format'
import { IssueStatusIcon } from './issue-icons'
import { formatElapsedClock } from './issue-timing'
import { useIssueTiming } from './use-issue-timing'
import { useIssues } from './use-issues'

function useTimingClock(startedAt: number | undefined) {
  const { data } = useQuery({
    queryKey: ['issue-timing-clock', startedAt] as const,
    queryFn: () => Date.now(),
    refetchInterval: 1000,
    enabled: startedAt != null,
    staleTime: 0,
  })
  return data ?? startedAt ?? 0
}

export function ActiveIssueTiming({ accountId }: { accountId: string }) {
  const { session, isPending, stopTiming, switchTiming } = useIssueTiming()
  const { data: issues = [] } = useIssues({ enabled: Boolean(session) })
  const now = useTimingClock(session?.startedAt)
  const [open, setOpen] = useState(false)

  if (!session) return null

  const activeIssue = issues.find((issue) => issue.id === session.issueId)
  const label = activeIssue ? formatIssueId(activeIssue.number) : 'Timing'

  const ownedIssues = issues
    .filter(
      (issue) =>
        issue.owner?.kind === 'account' &&
        issue.owner.id === accountId &&
        issue.status !== 'done' &&
        issue.id !== session.issueId,
    )
    .sort((a, b) => a.number - b.number)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-events-auto h-7 gap-1.5 px-2 text-xs tabular-nums"
            aria-label={`Timing ${label}`}
            title={`Timing ${label}`}
          />
        }
      >
        <Timer className="size-3.5 text-green-600 dark:text-green-400" />
        <span className="hidden sm:inline">{label}</span>
        <span>{formatElapsedClock(session.startedAt, now)}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {activeIssue?.title ?? label}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {label}  {formatElapsedClock(session.startedAt, now)}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5"
            disabled={isPending}
            onClick={() => {
              void stopTiming().then(() => setOpen(false))
            }}
          >
            <Square className="size-3.5 fill-current" />
            Stop
          </Button>
        </div>
        {ownedIssues.length > 0 ? (
          <div className="mt-1 border-t border-border/60 pt-1">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Switch to
            </p>
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {ownedIssues.map((issue) => (
                <li key={issue.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                    disabled={isPending}
                    onClick={() => {
                      void switchTiming(issue.id).then(() => setOpen(false))
                    }}
                  >
                    <IssueStatusIcon status={issue.status} />
                    <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                      {formatIssueId(issue.number)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
