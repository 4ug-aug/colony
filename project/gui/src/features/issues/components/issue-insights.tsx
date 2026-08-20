import { Button } from '#/components/ui/button'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '#/components/ui/chart'
import type { ChartConfig } from '#/components/ui/chart'
import { cn } from '#/lib/utils'
import { X } from 'lucide-react'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'
import { IssuePriorityIcon, IssueStatusIcon } from './issue-icons'
import type { Issue, IssuePriority, IssueStatus } from '../types'
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABEL,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUSES,
} from '../types'

const chartConfig = {
  none: { label: 'No priority', color: '#64748b' },
  urgent: { label: 'Urgent', color: '#eb5757' },
  high: { label: 'High', color: '#f2994a' },
  medium: { label: 'Medium', color: '#facc15' },
  low: { label: 'Low', color: '#4cb782' },
} satisfies ChartConfig

export type IssueInsight = {
  status: IssueStatus
  total: number
  priorities: Record<IssuePriority, number>
}

export function buildIssueInsights(issues: Issue[]): IssueInsight[] {
  return ISSUE_STATUSES.map((status) => ({
    status,
    total: issues.filter((issue) => issue.status === status).length,
    priorities: Object.fromEntries(
      ISSUE_PRIORITIES.map((priority) => [
        priority,
        issues.filter(
          (issue) => issue.status === status && issue.priority === priority,
        ).length,
      ]),
    ) as Record<IssuePriority, number>,
  }))
}

function StatusTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number
  y?: number
  payload?: { value: IssueStatus }
}) {
  if (!payload) return <g />
  return (
    <g transform={`translate(${x - 7}, ${y + 2})`}>
      <IssueStatusIcon status={payload.value} />
    </g>
  )
}

function ChartCursor({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
}: {
  x?: number
  y?: number
  width?: number
  height?: number
}) {
  const center = x + width / 2
  return (
    <line
      x1={center}
      x2={center}
      y1={y}
      y2={y + height}
      className="stroke-muted-foreground"
      strokeDasharray="3 3"
    />
  )
}

export function IssueInsights({
  issues,
  selectedStatuses,
  onStatusSelect,
  onClose,
}: {
  issues: Issue[]
  selectedStatuses: IssueStatus[]
  onStatusSelect: (status: IssueStatus) => void
  onClose: () => void
}) {
  const rows = buildIssueInsights(issues)
  const chartData = rows.map((row) => ({
    status: row.status,
    ...row.priorities,
  }))

  return (
    <section
      className="flex h-full w-full flex-col bg-background"
      aria-label="Issue insights"
    >
      <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-semibold tabular-nums">
            {issues.length}
          </span>
          <span className="text-sm text-muted-foreground">
            {issues.length === 1 ? 'issue' : 'issues'}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7"
          aria-label="Close insights panel"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div
        className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-xs text-muted-foreground"
        aria-label="Priority legend"
      >
        {ISSUE_PRIORITIES.map((priority) => (
          <div key={priority} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: chartConfig[priority].color }}
            />
            {ISSUE_PRIORITY_LABEL[priority]}
          </div>
        ))}
      </div>

      <div className="shrink-0 px-2">
        <ChartContainer
          config={chartConfig}
          className="h-[220px] w-full aspect-auto"
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
          >
            <XAxis
              dataKey="status"
              tick={<StatusTick />}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              width={34}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <ChartTooltip
              content={<ChartTooltipContent />}
              cursor={<ChartCursor />}
            />
            {ISSUE_PRIORITIES.map((priority) => (
              <Bar
                key={priority}
                dataKey={priority}
                name={priority}
                stackId="issues"
                fill={`var(--color-${priority})`}
                isAnimationActive={false}
                maxBarSize={22}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-auto border-t">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Count</th>
              {ISSUE_PRIORITIES.map((priority) => (
                <th key={priority} className="px-2 py-2 font-medium">
                  <IssuePriorityIcon priority={priority} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const active = selectedStatuses.includes(row.status)
              return (
                <tr
                  key={row.status}
                  className={cn(
                    'cursor-pointer border-t border-border/50 transition-colors hover:bg-muted/50',
                    active && 'bg-muted',
                  )}
                  onClick={() => onStatusSelect(row.status)}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <IssueStatusIcon status={row.status} />
                      <span className="max-w-28 truncate">
                        {ISSUE_STATUS_LABEL[row.status]}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {row.total}
                  </td>
                  {ISSUE_PRIORITIES.map((priority) => (
                    <td
                      key={priority}
                      className="px-2 py-2 text-right tabular-nums text-muted-foreground"
                      title={ISSUE_PRIORITY_LABEL[priority]}
                    >
                      {row.priorities[priority]}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
