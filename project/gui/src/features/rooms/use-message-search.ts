import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiFetch } from '#/lib/api-transport'
import type { MessageSearchHit } from './types'

export const MESSAGE_SEARCH_MIN_QUERY_LENGTH = 2

const searchDebounceMs = 250

export function useMessageSearch(query: string, open: boolean) {
  const trimmed = query.trim()
  const enabled = open && trimmed.length >= MESSAGE_SEARCH_MIN_QUERY_LENGTH

  return useQuery({
    queryKey: ['message-search', trimmed],
    enabled,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<MessageSearchHit[]> => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, searchDebounceMs)
        const onAbort = () => {
          clearTimeout(timer)
          reject(new DOMException('Aborted', 'AbortError'))
        }
        if (signal.aborted) {
          onAbort()
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
      })
      const response = await apiFetch(
        `/api/search/messages?q=${encodeURIComponent(trimmed)}`,
        { signal },
      )
      if (!response.ok) throw new Error('Unable to search messages')
      const body = (await response.json()) as { hits: MessageSearchHit[] }
      return body.hits
    },
  })
}
