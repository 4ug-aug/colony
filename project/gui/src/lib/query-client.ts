import { QueryClient } from '@tanstack/react-query'
import { attachAttachmentCacheCleanup } from '#/features/rooms/use-attachment-blob'

export function createAppQueryClient() {
  const queryClient = new QueryClient()
  attachAttachmentCacheCleanup(queryClient)
  return queryClient
}
