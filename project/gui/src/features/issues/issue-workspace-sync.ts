import type { QueryClient } from '@tanstack/react-query'
import { connectWorkspaceStream } from '#/lib/api-transport'
import { terminal } from '#/features/runs/run-helpers'
import type { Issue, IssueRun } from './types'
import { upsertIssueRunInCache } from './use-issue-runs'
import {
  issuesQueryKey,
  removeIssueFromCache,
  upsertIssueInCache,
} from './use-issues'

function setIssueActiveRun(
  queryClient: QueryClient,
  issueId: string,
  hasActiveRun: boolean,
) {
  queryClient.setQueryData(issuesQueryKey, (current: Issue[] | undefined) => {
    if (!current) return current
    return current.map((issue) => {
      if (issue.id !== issueId) return issue
      if (hasActiveRun) return { ...issue, hasActiveRun: true }
      if (!issue.hasActiveRun) return issue
      const { hasActiveRun: _removed, ...rest } = issue
      return rest
    })
  })
}

let detachIssueWorkspaceSync: (() => void) | undefined

export function attachIssueWorkspaceSync(queryClient: QueryClient) {
  detachIssueWorkspaceSync?.()
  const handle = connectWorkspaceStream({
    onMessage(data) {
      const event = JSON.parse(data) as {
        type: string
        issue?: Issue
        issueId?: string
        run?: IssueRun
      }
      if (
        (event.type === 'issue.created' || event.type === 'issue.changed') &&
        event.issue
      )
        upsertIssueInCache(queryClient, event.issue)
      if (event.type === 'issue.deleted' && event.issueId)
        removeIssueFromCache(queryClient, event.issueId)
      if (
        (event.type === 'issue_run.created' ||
          event.type === 'issue_run.changed') &&
        event.run
      ) {
        upsertIssueRunInCache(queryClient, event.run)
        setIssueActiveRun(
          queryClient,
          event.run.issueId,
          !terminal(event.run.state),
        )
      }
    },
  })
  detachIssueWorkspaceSync = () => handle.close()
}
