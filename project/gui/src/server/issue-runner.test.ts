import { expect, test } from 'bun:test'
import {
  createIssueRunner,
  IssueActiveRunError,
  IssueAgentRequiredError,
} from './issue-runner'
import type { Issue, IssueRun, IssueStore } from './issue-store'
import type { RunControl, RunSummary } from './run-control'

const baseIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: 'issue-1',
  number: 1,
  title: 'Dock badge',
  description: 'Show unread',
  status: 'todo',
  priority: 'none',
  tags: [],
  timeSpent: [],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})

function fakeStore(
  seed: Issue,
): IssueStore & { issues: Map<string, Issue>; runs: Map<string, IssueRun> } {
  const issues = new Map([[seed.id, seed]])
  const runs = new Map<string, IssueRun>()
  return {
    issues,
    runs,
    listIssues: () => [...issues.values()],
    getIssue: (id) => issues.get(id),
    getIssueByNumber: (number) =>
      [...issues.values()].find((issue) => issue.number === number),
    createIssue: () => {
      throw new Error('unused')
    },
    updateIssue: (id, patch, now) => {
      const current = issues.get(id)
      if (!current) throw new Error('Issue not found')
      const updated: Issue = {
        ...current,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.timeSpent !== undefined
          ? { timeSpent: patch.timeSpent }
          : {}),
        updatedAt: now,
      }
      if (patch.parentId === null) delete updated.parentId
      else if (patch.parentId !== undefined) updated.parentId = patch.parentId
      issues.set(id, updated)
      return updated
    },
    assignIssue: () => {
      throw new Error('unused')
    },
    createRun: (run) => {
      if (
        [...runs.values()].some(
          (existing) =>
            existing.issueId === run.issueId &&
            (existing.state === 'preparing' || existing.state === 'running'),
        )
      )
        return undefined
      runs.set(run.id, run)
      return run
    },
    updateRun: (run) => {
      runs.set(run.id, run)
    },
    getRun: (id) => runs.get(id),
    listRuns: (issueId) =>
      [...runs.values()].filter((run) => run.issueId === issueId),
    failStaleRuns: (now) => {
      const stale = [...runs.values()].filter(
        (run) => run.state === 'preparing' || run.state === 'running',
      )
      for (const run of stale) {
        const failed = {
          ...run,
          state: 'failed' as const,
          error: 'Server restarted before the run completed.',
          completedAt: now,
        }
        runs.set(run.id, failed)
      }
      return stale.map((run) => runs.get(run.id)!)
    },
  }
}

function fakeControl(starts: RunSummary[] = []): RunControl & {
  starts: { task: string; context: unknown }[]
} {
  const startsLog: { task: string; context: unknown }[] = []
  let index = 0
  return {
    starts: startsLog,
    subscribe: () => () => {},
    subscribeSteps: () => () => {},
    start: (task, context) => {
      startsLog.push({ task, context })
      const summary =
        starts[index++] ??
        ({
          id: `run-${index}`,
          task,
          state: 'preparing',
          createdAt: 10,
          stdout: '',
          stderr: '',
          agentId: context.agentDefinitionId ?? 'software-engineer',
          provider: 'openai',
          model: '',
        } satisfies RunSummary)
      return context.onCreate(summary)
    },
    cancel: async () => undefined,
    stop: async () => {},
  }
}

test('startRun uses agent owner and moves In review to In progress', () => {
  const store = fakeStore(
    baseIssue({
      status: 'in_review',
      owner: { kind: 'agent', id: 'antboy' },
    }),
  )
  const control = fakeControl()
  const runner = createIssueRunner({ store, control })
  const result = runner.startRun('issue-1')
  expect(result.issue.status).toBe('in_progress')
  expect(result.run.agentId).toBe('antboy')
  expect(control.starts[0]?.task).toContain('SWE-1')
  expect(control.starts[0]?.task).toContain('<<<issue')
  expect(
    (control.starts[0]?.context as { agentDefinitionId?: string })
      .agentDefinitionId,
  ).toBe('antboy')
})

test('startRun requires agentDefinitionId when owner is an account', () => {
  const store = fakeStore(baseIssue({ owner: { kind: 'account', id: 'ada' } }))
  const runner = createIssueRunner({ store, control: fakeControl() })
  expect(() => runner.startRun('issue-1')).toThrow(IssueAgentRequiredError)
  const result = runner.startRun('issue-1', {
    agentDefinitionId: 'software-engineer',
  })
  expect(result.run.agentId).toBe('software-engineer')
  expect(store.getIssue('issue-1')?.owner).toEqual({
    kind: 'account',
    id: 'ada',
  })
})

test('startRun does not move Done Issues and rejects a second active run', () => {
  const store = fakeStore(baseIssue({ status: 'done' }))
  const runner = createIssueRunner({
    store,
    control: fakeControl(),
  })
  const result = runner.startRun('issue-1', {
    agentDefinitionId: 'software-engineer',
  })
  expect(result.issue.status).toBe('done')
  expect(() =>
    runner.startRun('issue-1', { agentDefinitionId: 'software-engineer' }),
  ).toThrow(IssueActiveRunError)
})
