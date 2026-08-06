import { expect, test } from 'bun:test'
import {
  createIssueRunner,
  IssueActiveRunError,
  IssueAgentRequiredError,
  IssueParentCoveredError,
} from './issue-runner'
import type { Issue, IssueOwner, IssueRun, IssueStore } from './issue-store'
import type { RunControl, RunSummary } from './run-control'

const baseIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: 'issue-1',
  number: 1,
  title: 'Dock badge',
  description: 'Show unread',
  deliverable: '',
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
  extras: Issue[] = [],
): IssueStore & { issues: Map<string, Issue>; runs: Map<string, IssueRun> } {
  const issues = new Map([[seed.id, seed], ...extras.map((i) => [i.id, i] as const)])
  const runs = new Map<string, IssueRun>()
  return {
    issues,
    runs,
    listIssues: () => [...issues.values()],
    listChildIssues: (parentId) =>
      [...issues.values()].filter((issue) => issue.parentId === parentId),
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
    assignIssue: (id, owner, now) => {
      const current = issues.get(id)
      if (!current) throw new Error('Issue not found')
      const updated: Issue = { ...current, updatedAt: now }
      if (owner) updated.owner = owner
      else delete updated.owner
      issues.set(id, updated)
      return updated
    },
    setDeliverable: (id, deliverable, now) => {
      const current = issues.get(id)
      if (!current) throw new Error('Issue not found')
      const updated = { ...current, deliverable, updatedAt: now }
      issues.set(id, updated)
      return updated
    },
    deleteIssue: (id) => {
      if (!issues.has(id)) return false
      for (const child of issues.values()) {
        if (child.parentId === id) {
          const { parentId: _removed, ...rest } = child
          issues.set(child.id, rest)
        }
      }
      for (const [runId, run] of runs) {
        if (run.issueId === id) runs.delete(runId)
      }
      return issues.delete(id)
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
    hasActiveRun: (issueId) =>
      [...runs.values()].some(
        (run) =>
          run.issueId === issueId &&
          (run.state === 'preparing' || run.state === 'running'),
      ),
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

function fakeControl(
  starts: RunSummary[] = [],
  listeners: Array<(run: RunSummary) => void> = [],
): RunControl & {
  starts: { task: string; context: unknown }[]
  emit: (summary: RunSummary) => void
} {
  const startsLog: { task: string; context: unknown }[] = []
  let index = 0
  return {
    starts: startsLog,
    subscribe: (listener) => {
      listeners.push(listener)
      return () => {}
    },
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
    emit: (summary) => {
      for (const listener of listeners) listener(summary)
    },
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

test('assignOwner starts a run for an agent and skips Account owners', () => {
  const store = fakeStore(baseIssue())
  const control = fakeControl()
  const runner = createIssueRunner({ store, control })
  const account = runner.assignOwner('issue-1', {
    kind: 'account',
    id: 'ada',
  })
  expect(account.run).toBeUndefined()
  expect(control.starts).toHaveLength(0)

  const agent = runner.assignOwner('issue-1', {
    kind: 'agent',
    id: 'antboy',
  })
  expect(agent.run?.agentId).toBe('antboy')
  expect(agent.issue.status).toBe('in_progress')
  expect(control.starts).toHaveLength(1)
})

test('parent cover blocks startRun and assign-agent auto-start', () => {
  const parent = baseIssue({
    id: 'parent',
    number: 1,
    owner: { kind: 'agent', id: 'antboy' },
  })
  const child = baseIssue({
    id: 'child',
    number: 2,
    parentId: 'parent',
    title: 'Child',
  })
  const store = fakeStore(child, [parent])
  const control = fakeControl()
  const runner = createIssueRunner({ store, control })
  expect(() =>
    runner.startRun('child', { agentDefinitionId: 'software-engineer' }),
  ).toThrow(IssueParentCoveredError)

  const assigned = runner.assignOwner('child', {
    kind: 'agent',
    id: 'software-engineer',
  } satisfies IssueOwner)
  expect(assigned.issue.owner).toEqual({
    kind: 'agent',
    id: 'software-engineer',
  })
  expect(assigned.run).toBeUndefined()
  expect(control.starts).toHaveLength(0)
})

test('startRun includes children in the parent task', () => {
  const parent = baseIssue({ id: 'parent', number: 1, title: 'Parent' })
  const child = baseIssue({
    id: 'child',
    number: 2,
    parentId: 'parent',
    title: 'Child work',
    status: 'todo',
  })
  const store = fakeStore(parent, [child])
  const control = fakeControl()
  const runner = createIssueRunner({ store, control })
  runner.startRun('parent', { agentDefinitionId: 'antboy' })
  expect(control.starts[0]?.task).toContain('<<<children')
  expect(control.starts[0]?.task).toContain('SWE-2')
  expect(control.starts[0]?.task).toContain('Child work')
})

test('succeeded run overwrites Issue Deliverable', () => {
  const store = fakeStore(baseIssue({ owner: { kind: 'agent', id: 'antboy' } }))
  const listeners: Array<(run: RunSummary) => void> = []
  const control = fakeControl([], listeners)
  const runner = createIssueRunner({ store, control })
  const { run } = runner.startRun('issue-1')

  control.emit({
    id: run.id,
    task: run.task,
    state: 'succeeded',
    createdAt: run.createdAt,
    stdout: 'Done: badge shipped.',
    stderr: '',
    agentId: 'antboy',
    provider: 'openai',
    model: '',
  })
  expect(store.getIssue('issue-1')?.deliverable).toBe('Done: badge shipped.')

  control.emit({
    id: run.id,
    task: run.task,
    state: 'failed',
    createdAt: run.createdAt,
    stdout: 'should not land',
    stderr: '',
    agentId: 'antboy',
    provider: 'openai',
    model: '',
  })
  expect(store.getIssue('issue-1')?.deliverable).toBe('Done: badge shipped.')
})
