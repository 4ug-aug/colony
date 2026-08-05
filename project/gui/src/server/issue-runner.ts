import type { RunControl, RunSummary } from './run-control'
import {
  buildIssueRunTask,
  type Issue,
  type IssueRun,
  type IssueStore,
} from './issue-store'

export class IssueAgentRequiredError extends Error {
  constructor() {
    super('agentDefinitionId is required when the Issue owner is not an agent')
    this.name = 'IssueAgentRequiredError'
  }
}

export class IssueActiveRunError extends Error {
  constructor() {
    super('An Issue run is already active')
    this.name = 'IssueActiveRunError'
  }
}

export type IssueRunner = {
  startRun(
    issueId: string,
    options?: { agentDefinitionId?: string },
  ): { issue: Issue; run: IssueRun }
  cancel(runId: string): Promise<IssueRun | undefined>
  failStaleRuns(): IssueRun[]
  stop(): void
}

export function createIssueRunner(options: {
  store: IssueStore
  control: RunControl
  now?: () => number
  onIssueChange?: (issue: Issue) => void
  onRunCreated?: (run: IssueRun) => void
  onRunChange?: (run: IssueRun) => void
}): IssueRunner {
  const now = options.now ?? Date.now
  const project = (summary: RunSummary): void => {
    const existing = options.store.getRun(summary.id)
    if (!existing) return
    const changed = { ...existing, ...summary }
    options.store.updateRun(changed)
    options.onRunChange?.(changed)
  }
  const unsubscribe = options.control.subscribe(project)

  return {
    startRun: (issueId, startOptions = {}) => {
      const issue = options.store.getIssue(issueId)
      if (!issue) throw new Error('Issue not found')
      const agentDefinitionId =
        issue.owner?.kind === 'agent'
          ? issue.owner.id
          : startOptions.agentDefinitionId
      if (!agentDefinitionId) throw new IssueAgentRequiredError()
      const parent = issue.parentId
        ? options.store.getIssue(issue.parentId)
        : undefined
      const task = buildIssueRunTask(issue, parent)
      return options.control.start(task, {
        issueId: issue.id,
        agentDefinitionId,
        onCreate: (summary) => {
          const created = options.store.createRun({
            ...summary,
            issueId: issue.id,
          })
          if (!created) throw new IssueActiveRunError()
          options.onRunCreated?.(created)
          if (issue.status !== 'done' && issue.status !== 'in_progress') {
            const updated = options.store.updateIssue(
              issue.id,
              { status: 'in_progress' },
              now(),
            )
            options.onIssueChange?.(updated)
            return { issue: updated, run: created }
          }
          return { issue, run: created }
        },
      })
    },
    cancel: async (runId) => {
      const run = await options.control.cancel(runId)
      return run ? options.store.getRun(run.id) : undefined
    },
    failStaleRuns: () => {
      const runs = options.store.failStaleRuns(now())
      for (const run of runs) options.onRunChange?.(run)
      return runs
    },
    stop: () => {
      unsubscribe()
    },
  }
}
