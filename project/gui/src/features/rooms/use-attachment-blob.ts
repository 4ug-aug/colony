import { queryOptions, useQuery } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { apiFetch } from '#/lib/api-transport'

function attachmentQueryKey(id: string) {
  return ['attachment', id] as const
}

export async function fetchAttachmentObjectUrl(id: string): Promise<string> {
  const response = await apiFetch(`/api/attachments/${id}`)
  if (!response.ok) throw new Error(`Failed to load attachment ${id}`)
  return URL.createObjectURL(await response.blob())
}

function attachmentQueryOptions(id: string) {
  return queryOptions({
    queryKey: attachmentQueryKey(id),
    queryFn: () => fetchAttachmentObjectUrl(id),
    staleTime: Infinity,
    gcTime: 0,
  })
}

export function attachAttachmentCacheCleanup(queryClient: QueryClient) {
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'removed') return
    if (event.query.queryKey[0] !== 'attachment') return
    const data = event.query.state.data
    if (typeof data === 'string' && data.startsWith('blob:')) {
      URL.revokeObjectURL(data)
    }
  })
}

export function useAttachmentBlob(id: string, enabled = true) {
  const query = useQuery({
    ...attachmentQueryOptions(id),
    enabled,
  })
  return {
    url: query.data,
    isPending: query.isPending,
    isError: query.isError,
  }
}
