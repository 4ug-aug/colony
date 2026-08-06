import { BrailleLoader } from '#/components/ui/braille-loader'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { Circle, CornerDownRight, Timer } from 'lucide-react'
import { useState } from 'react'
import { formatIssueCreatedAt, formatIssueId } from './format'
import { IssueStatusIcon } from './issue-icons'
import { LabelDot } from './issue-labels'
import {
  OwnerPicker,
  PriorityPicker,
  StatusPicker,
} from './issue-property-editors'
import type { Issue } from './types'
import { useIssueTiming } from './use-issue-timing'
import { useIssues } from './use-issues'

function ChildProgressChip({
  issue,
  onOpen,
}: {
  issue: Issue
  onOpen?: (issueId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const { data: issues = [] } = useIssues()
  const progress = issue.childProgress
  if (!progress) return null

  const children = issues
    .filter((child) => child.parentId === issue.id)
    .sort((a, b) => a.number - b.number)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border/70 px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label={`${progress.done} of ${progress.total} sub-issues done`}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <Circle className="size-3.5" />
        {progress.done}/{progress.total}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex items-center justify-between gap-2">
          <p className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">
            Sub-issues
          </p>
          <p className="px-2 pb-1.5 text-xs text-muted-foreground">
            {progress.done} of {progress.total} done
          </p>
        </div>
        <ul className="max-h-64 space-y-0.5 overflow-y-auto">
          {children.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                onPointerDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation()
                  onOpen?.(child.id)
                  setOpen(false)
                }}
              >
                <IssueStatusIcon status={child.status} />
                <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                  {formatIssueId(child.number)}
                </span>
                <span className="min-w-0 flex-1 truncate">{child.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function StartTimingButton({ issueId }: { issueId: string }) {
  const { session, isPending, switchTiming } = useIssueTiming()
  const isActive = session?.issueId === issueId
  const label = isActive ? 'Timing this issue' : 'Start timing'

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          isActive ? (
            <span
              className="inline-flex size-7 shrink-0 items-center justify-center text-green-700 dark:text-green-400"
              aria-label={label}
            />
          ) : (
            <button
              type="button"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
              aria-label={label}
              disabled={isPending}
              onClick={(event) => {
                event.stopPropagation()
                void switchTiming(issueId)
              }}
            />
          )
        }
      >
        <Timer className={isActive ? 'size-3.5 animate-pulse' : 'size-3.5'} />
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

function IssueTimeSpent({ timeSpent }: { timeSpent: number[] }) {
  const total = timeSpent.reduce((sum, minutes) => sum + minutes, 0)
  return (
    <span
      className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
      aria-label="Time spent"
      title="Time spent"
    >
      {total > 0 ? `${total}m` : '—'}
    </span>
  )
}

export function IssueRow({
  issue,
  depth = 0,
  onOpen,
}: {
  issue: Issue
  depth?: number
  onOpen?: (issueId: string) => void
}) {
  return (
    <div
      className="group flex h-9 items-center gap-2 border-b border-border/40 px-3 text-sm last:border-b-0 hover:bg-muted/40"
      style={depth > 0 ? { paddingLeft: 12 + depth * 16 } : undefined}
      onClick={
        onOpen
          ? (event) => {
              const target = event.target as HTMLElement
              if (target.closest('button, a, input, textarea, [role="combobox"]'))
                return
              onOpen(issue.id)
            }
          : undefined
      }
    >
      {depth > 0 ? (
        <CornerDownRight
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      ) : null}
      <PriorityPicker issue={issue} />
      <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
        {formatIssueId(issue.number)}
      </span>
      <StatusPicker issue={issue} />
      <span className="min-w-0 flex-1 truncate font-medium">{issue.title}</span>
      {issue.hasActiveRun ? (
        <BrailleLoader
          text="Running"
          className="shrink-0 text-xs text-muted-foreground"
        />
      ) : null}
      <div className="flex min-w-0 items-center gap-1.5">
        {issue.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-7 max-w-32 items-center gap-1.5 truncate rounded-full border border-border/70 px-2 text-xs text-muted-foreground"
          >
            <LabelDot tag={tag} className="size-1.5" />
            {tag}
          </span>
        ))}
        <ChildProgressChip issue={issue} onOpen={onOpen} />
      </div>
      <OwnerPicker issue={issue} variant="list" />
      <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
        {formatIssueCreatedAt(issue.createdAt)}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <IssueTimeSpent timeSpent={issue.timeSpent} />
        <StartTimingButton issueId={issue.id} />
      </div>
    </div>
  )
}
