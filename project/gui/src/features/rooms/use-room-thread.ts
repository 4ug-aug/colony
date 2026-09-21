import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '#/lib/api-transport'
import { useEffect } from 'react'
import type { RoomThread } from './types'

export function roomThreadQueryKey(roomId: string, rootId?: string) {
  return rootId
    ? (['room-thread', roomId, rootId] as const)
    : (['room-thread', roomId] as const)
}

/**
 * Fetches the durable thread for a root message.
 * Opening the thread acknowledges its Thread Attention; the Room and
 * other threads are left untouched.
 */
export function useRoomThread(
  roomId: string | undefined,
  rootId: string | undefined,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: roomThreadQueryKey(roomId ?? '', rootId ?? ''),
    enabled: Boolean(roomId && rootId),
    gcTime: 0,
    queryFn: async (): Promise<RoomThread> => {
      const response = await apiFetch(
        `/api/rooms/${roomId}/messages/${rootId}/thread`,
      )
      const body = (await response.json()) as RoomThread & { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Unable to load thread')
      // Opening the thread acknowledges its Thread Attention; the Room and
      // other threads are left untouched. Fire-and-forget: this must not
      // block or fail the thread load.
      void apiFetch(
        `/api/rooms/${roomId}/threads/${rootId}/attention/acknowledge`,
        { method: 'POST' },
      )
      return body
    },
  })
  useEffect(
    () => () => {
      if (!roomId || !rootId) return
      queryClient.removeQueries({
        queryKey: roomThreadQueryKey(roomId, rootId),
        exact: true,
      })
    },
    [queryClient, roomId, rootId],
  )
  return {
    root: query.data?.root,
    replies: query.data?.replies ?? [],
    results: query.data?.results ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : undefined,
    refetch: query.refetch,
  }
}
