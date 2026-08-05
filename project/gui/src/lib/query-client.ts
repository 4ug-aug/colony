import { QueryClient } from '@tanstack/react-query'
import { attachIssueWorkspaceSync } from '#/features/issues/issue-workspace-sync'
import { attachAttachmentCacheCleanup } from '#/features/rooms/use-attachment-blob'

export function createAppQueryClient() {
  const queryClient = new QueryClient()
  attachAttachmentCacheCleanup(queryClient)
  attachIssueWorkspaceSync(queryClient)
  return queryClient
}
