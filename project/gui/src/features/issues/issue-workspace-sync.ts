import type { QueryClient } from '@tanstack/react-query'
import { connectWorkspaceStream } from '#/lib/api-transport'
import type { IssueRun } from './types'
import type { IssueRunStep } from '#/server/features/issues/issue-store'
import {
  appendIssueRunStepInCache,
  issueRunsQueryKey,
  upsertIssueRunInCache,
} from './use-issue-runs'
import { invalidateIssues } from './use-issues'

type IssueWorkspaceEvent =
  | { type: 'workspace.snapshot' }
  | { type: 'issue.created' }
  | { type: 'issue.changed' }
  | { type: 'issue.deleted'; issueId: string }
  | { type: 'issue_run.created'; run: IssueRun }
  | { type: 'issue_run.changed'; run: IssueRun }
  | { type: 'issue_run.step'; runId: string; step: IssueRunStep }

export function applyIssueWorkspaceEvent(
  queryClient: QueryClient,
  event: IssueWorkspaceEvent,
) {
  if (
    event.type === 'workspace.snapshot' ||
    event.type === 'issue.created' ||
    event.type === 'issue.changed'
  )
    invalidateIssues(queryClient)
  if (event.type === 'issue.deleted') {
    invalidateIssues(queryClient)
    queryClient.removeQueries({ queryKey: issueRunsQueryKey(event.issueId) })
  }
  if (event.type === 'issue_run.created' || event.type === 'issue_run.changed') {
    upsertIssueRunInCache(queryClient, event.run)
    invalidateIssues(queryClient)
  }
  if (event.type === 'issue_run.step')
    appendIssueRunStepInCache(queryClient, event.runId, event.step)
}

let detachIssueWorkspaceSync: (() => void) | undefined

export function attachIssueWorkspaceSync(queryClient: QueryClient) {
  detachIssueWorkspaceSync?.()
  const handle = connectWorkspaceStream({
    onMessage(data) {
      applyIssueWorkspaceEvent(
        queryClient,
        JSON.parse(data) as IssueWorkspaceEvent,
      )
    },
  })
  detachIssueWorkspaceSync = () => handle.close()
}
