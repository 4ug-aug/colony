import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { toast } from '#/components/ui/toast'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { terminal } from '#/features/runs/run-helpers'
import { cn } from '#/lib/utils'
import { ChevronDown, Play, Square } from 'lucide-react'
import { useState } from 'react'
import { formatIssueCreatedAt, formatIssueId } from './format'
import type { Issue, IssueRun } from './types'
import {
  useCancelIssueRun,
  useIssueRuns,
  useStartIssueRun,
} from './use-issue-runs'
import { useIssues } from './use-issues'

const runBadgeVariant = (state: string) =>
  state === 'failed' ? 'destructive' : 'success'

function IssueRunRow({
  run,
  agentName,
  onCancel,
  cancelling,
  onSelect,
}: {
  run: IssueRun
  agentName: string
  onCancel: () => void
  cancelling: boolean
  onSelect?: (run: IssueRun) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) onSelect?.(run)
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm outline-none focus-visible:underline"
            />
          }
        >
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              !open && '-rotate-90',
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate font-medium">
            {agentName}
          </span>
          <Badge variant={runBadgeVariant(run.state)}>{run.state}</Badge>
        </CollapsibleTrigger>
        {!terminal(run.state) && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="size-7 shrink-0"
            aria-label="Cancel run"
            disabled={cancelling}
            onClick={onCancel}
          >
            <Square className="size-3.5" />
          </Button>
        )}
      </div>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out motion-reduce:transition-none data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 [&[hidden]:not([hidden='until-found'])]:hidden">
        <div className="space-y-1.5 px-3 pb-3 pl-9 text-xs text-muted-foreground">
          <p>{formatIssueCreatedAt(run.createdAt)}</p>
          {run.error ? (
            <p className="whitespace-pre-wrap break-words text-destructive">
              {run.error}
            </p>
          ) : null}
          {run.stderr.trim() ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted px-2 py-1.5 font-mono text-[0.7rem] leading-4 text-muted-foreground">
              {run.stderr}
            </pre>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function IssueRunsRail({
  issue,
  onSelectRun,
}: {
  issue: Issue
  onSelectRun?: (run: IssueRun) => void
}) {
  const { data: runs = [], isPending } = useIssueRuns(issue.id)
  const { data: issues = [] } = useIssues()
  const startRun = useStartIssueRun()
  const cancelRun = useCancelIssueRun()
  const { data: agents = [] } = useAgentDefinitions()
  const [agentDefinitionId, setAgentDefinitionId] = useState(
    agents[0]?.id ?? '',
  )

  const parent = issue.parentId
    ? issues.find((candidate) => candidate.id === issue.parentId)
    : undefined
  const parentCovered = parent?.owner?.kind === 'agent'
  const hasActiveRun = runs.some((run) => !terminal(run.state))
  const needsAgentPicker = issue.owner?.kind !== 'agent'
  const selectedAgentId = agentDefinitionId || agents[0]?.id || ''
  const canStart =
    !parentCovered &&
    !hasActiveRun &&
    !(needsAgentPicker && !selectedAgentId)

  const start = async () => {
    try {
      const result = await startRun.mutateAsync({
        issueId: issue.id,
        ...(needsAgentPicker && selectedAgentId
          ? { agentDefinitionId: selectedAgentId }
          : {}),
      })
      toast.add({
        type: 'success',
        title: `Started run on ${formatIssueId(issue.number)}`,
        description: agentNameFrom(agents, result.run.agentId),
      })
      onSelectRun?.(result.run)
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not start run',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  const cancel = async (run: IssueRun) => {
    try {
      await cancelRun.mutateAsync(run.id)
      toast.add({
        type: 'success',
        title: 'Run cancelled',
        description: formatIssueId(issue.number),
      })
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not cancel run',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Runs</h3>
        <div className="flex items-center gap-1.5">
          {needsAgentPicker && !parentCovered && agents.length > 0 && (
            <Select
              value={selectedAgentId}
              onValueChange={(value) => setAgentDefinitionId(value ?? '')}
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-36"
                aria-label="Agent for run"
              >
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            disabled={startRun.isPending || !canStart}
            title={
              parentCovered
                ? 'Blocked while the parent Issue is owned by an agent'
                : hasActiveRun
                  ? 'A run is already active'
                  : undefined
            }
            onClick={() => void start()}
          >
            <Play data-icon="inline-start" className="size-3.5" />
            Start
          </Button>
        </div>
      </div>
      {parentCovered ? (
        <p className="text-xs text-muted-foreground">
          Covered by parent agent work — Start run is blocked.
        </p>
      ) : null}
      {isPending ? (
        <p className="text-xs text-muted-foreground">Loading runs…</p>
      ) : runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No runs yet</p>
      ) : (
        <div className="divide-y overflow-hidden rounded-md border">
          {runs.map((run) => (
            <IssueRunRow
              key={run.id}
              run={run}
              agentName={agentNameFrom(agents, run.agentId)}
              cancelling={cancelRun.isPending}
              onCancel={() => void cancel(run)}
              onSelect={onSelectRun}
            />
          ))}
        </div>
      )}
    </section>
  )
}
