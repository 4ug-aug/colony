import type { RunControl, RunSummary } from '#/server/features/runs/run-control'
import {
  buildIssueRunTask,
  isParentCovered,
  type Issue,
  type IssueOwner,
  type IssueRun,
  type IssueRunStep,
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

export class IssueParentCoveredError extends Error {
  constructor() {
    super(
      'Start run is blocked while the parent Issue is owned by an agent',
    )
    this.name = 'IssueParentCoveredError'
  }
}

export type IssueRunner = {
  startRun(
    issueId: string,
    options?: { agentDefinitionId?: string },
  ): { issue: Issue; run: IssueRun }
  /** Assign owner; auto-start when assigning an agent and not parent-covered / idle. */
  assignOwner(
    issueId: string,
    owner: IssueOwner | undefined,
  ): { issue: Issue; run?: IssueRun }
  /** After create with an agent owner — start a run when not parent-covered. */
  maybeStartForOwner(issueId: string): { issue: Issue; run?: IssueRun }
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
  onStep?: (step: IssueRunStep) => void
}): IssueRunner {
  const now = options.now ?? Date.now
  const project = (summary: RunSummary): void => {
    const existing = options.store.getRun(summary.id)
    if (!existing) return
    const wasSucceeded = existing.state === 'succeeded'
    const changed = { ...existing, ...summary }
    options.store.updateRun(changed)
    options.onRunChange?.(changed)
    if (!wasSucceeded && changed.state === 'succeeded') {
      try {
        const updated = options.store.setDeliverable(
          changed.issueId,
          changed.stdout,
          now(),
        )
        options.onIssueChange?.(updated)
      } catch (error) {
        console.error(
          'Failed to set Issue deliverable from succeeded run',
          changed.id,
          error,
        )
      }
    }
  }
  const unsubscribe = options.control.subscribe(project)
  const unsubscribeSteps = options.control.subscribeSteps((runId, step) => {
    const run = options.store.getRun(runId)
    if (!run) return
    const stored: IssueRunStep = {
      id: crypto.randomUUID(),
      runId,
      idx: options.store.listSteps(runId).length,
      kind: step.kind,
      ...(step.tool === undefined ? {} : { tool: step.tool }),
      ...(step.callId === undefined ? {} : { callId: step.callId }),
      text: step.text,
      createdAt: step.at,
      at: step.at,
    }
    options.store.appendStep(stored)
    options.onStep?.(stored)
  })

  const startRun = (
    issueId: string,
    startOptions: { agentDefinitionId?: string } = {},
  ): { issue: Issue; run: IssueRun } => {
    const issue = options.store.getIssue(issueId)
    if (!issue) throw new Error('Issue not found')
    if (isParentCovered(options.store, issue))
      throw new IssueParentCoveredError()
    const agentDefinitionId =
      issue.owner?.kind === 'agent'
        ? issue.owner.id
        : startOptions.agentDefinitionId
    if (!agentDefinitionId) throw new IssueAgentRequiredError()
    const parent = issue.parentId
      ? options.store.getIssue(issue.parentId)
      : undefined
    const children = options.store.listChildIssues(issue.id)
    const task = buildIssueRunTask(issue, parent, children)
    return options.control.start(task, {
      issueId: issue.id,
      agentDefinitionId,
      ...(issue.effectiveBranch
        ? { repositoryBase: issue.effectiveBranch }
        : {}),
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
  }

  const maybeStartForOwner = (
    issueId: string,
  ): { issue: Issue; run?: IssueRun } => {
    const issue = options.store.getIssue(issueId)
    if (!issue) throw new Error('Issue not found')
    if (issue.owner?.kind !== 'agent') return { issue }
    if (isParentCovered(options.store, issue)) return { issue }
    if (options.store.hasActiveRun(issue.id)) return { issue }
    return startRun(issueId)
  }

  return {
    startRun,
    assignOwner: (issueId, owner) => {
      const issue = options.store.assignIssue(issueId, owner, now())
      options.onIssueChange?.(issue)
      if (owner?.kind !== 'agent') return { issue }
      if (isParentCovered(options.store, issue)) return { issue }
      if (options.store.hasActiveRun(issue.id)) return { issue }
      return startRun(issueId)
    },
    maybeStartForOwner,
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
      unsubscribeSteps()
    },
  }
}
