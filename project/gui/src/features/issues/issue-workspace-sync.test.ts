import { QueryClient } from '@tanstack/react-query'
import { expect, test } from 'bun:test'
import { applyIssueWorkspaceEvent } from './issue-workspace-sync'
import { issuesQueryKey } from './use-issues'
import { issueRunsQueryKey } from './use-issue-runs'
import type { IssueRun } from './types'
import type { IssueRunStep } from './use-issue-runs'

const run: IssueRun = {
  id: 'run-1',
  issueId: 'issue-1',
  task: 'Help',
  agentId: 'software-engineer',
  provider: 'cursor',
  model: 'gpt',
  state: 'running',
  createdAt: 1,
  stdout: '',
  stderr: '',
}

const step: IssueRunStep = {
  id: 'step-1',
  runId: 'run-1',
  idx: 0,
  kind: 'message',
  text: 'working',
  createdAt: 1,
  at: 1,
}

function clientWithIssues() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(issuesQueryKey, [])
  return queryClient
}

test('issue record and run lifecycle events invalidate the issues list', () => {
  for (const event of [
    { type: 'workspace.snapshot' as const },
    { type: 'issue.created' as const },
    { type: 'issue.changed' as const },
    { type: 'issue.deleted' as const, issueId: 'issue-1' },
    { type: 'issue_run.created' as const, run },
    {
      type: 'issue_run.changed' as const,
      run: { ...run, state: 'succeeded' as const },
    },
  ]) {
    const queryClient = clientWithIssues()
    applyIssueWorkspaceEvent(queryClient, event)
    expect(queryClient.getQueryState(issuesQueryKey)?.isInvalidated).toBe(true)
  }
})

test('issue_run.step appends the step and does not refetch issues', () => {
  const queryClient = clientWithIssues()
  queryClient.setQueryData(['issue-run-steps', 'run-1'], [])
  applyIssueWorkspaceEvent(queryClient, {
    type: 'issue_run.step',
    runId: 'run-1',
    step,
  })
  expect(queryClient.getQueryState(issuesQueryKey)?.isInvalidated).toBe(false)
  expect(
    queryClient.getQueryData<IssueRunStep[]>(['issue-run-steps', 'run-1']),
  ).toEqual([step])
})

test('issue.deleted drops that issue’s run cache', () => {
  const queryClient = clientWithIssues()
  queryClient.setQueryData(issueRunsQueryKey('issue-1'), [run])
  applyIssueWorkspaceEvent(queryClient, {
    type: 'issue.deleted',
    issueId: 'issue-1',
  })
  expect(queryClient.getQueryData(issueRunsQueryKey('issue-1'))).toBeUndefined()
})
