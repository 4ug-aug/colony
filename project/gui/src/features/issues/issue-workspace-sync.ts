import type { QueryClient } from '@tanstack/react-query'
import { connectWorkspaceStream } from '#/lib/api-transport'
import type { Issue } from './types'
import { upsertIssueInCache } from './use-issues'

export function attachIssueWorkspaceSync(queryClient: QueryClient) {
  connectWorkspaceStream({
    onMessage(data) {
      const event = JSON.parse(data) as {
        type: string
        issue?: Issue
      }
      if (
        (event.type === 'issue.created' || event.type === 'issue.changed') &&
        event.issue
      )
        upsertIssueInCache(queryClient, event.issue)
    },
  })
}
