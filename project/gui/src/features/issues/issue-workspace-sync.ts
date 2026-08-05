import type { QueryClient } from '@tanstack/react-query'
import { connectWorkspaceStream } from '#/lib/api-transport'
import type { Issue, IssueRun } from './types'
import { upsertIssueRunInCache } from './use-issue-runs'
import { upsertIssueInCache } from './use-issues'

export function attachIssueWorkspaceSync(queryClient: QueryClient) {
  connectWorkspaceStream({
    onMessage(data) {
      const event = JSON.parse(data) as {
        type: string
        issue?: Issue
        run?: IssueRun
      }
      if (
        (event.type === 'issue.created' || event.type === 'issue.changed') &&
        event.issue
      )
        upsertIssueInCache(queryClient, event.issue)
      if (
        (event.type === 'issue_run.created' ||
          event.type === 'issue_run.changed') &&
        event.run
      )
        upsertIssueRunInCache(queryClient, event.run)
    },
  })
}
