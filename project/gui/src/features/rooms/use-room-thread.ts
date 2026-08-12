import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '#/lib/api-transport'
import { runResultsForThread } from './thread-helpers'
import type { RoomMessage, RoomRun, RoomThread, RunResultReply } from './types'

const emptyResults: RoomThread['results'] = []

function mergeReplies(persisted: RoomMessage[], live: RoomMessage[]) {
  const byId = new Map(persisted.map((message) => [message.id, message]))
  for (const message of live) byId.set(message.id, message)
  return [...byId.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )
}

function mergeResults(persisted: RunResultReply[], live: RunResultReply[]) {
  const byId = new Map(persisted.map((result) => [result.id, result]))
  for (const result of live) byId.set(result.id, result)
  return [...byId.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )
}

/**
 * Fetches the durable thread for a root message and layers in replies
 * received live over the room stream (passed in from `useRooms`).
 * Successful Room-linked run finals from `runs` are merged the same way so
 * an open rail shows a just-finished result without waiting on refetch.
 */
export function useRoomThread(
  roomId: string | undefined,
  rootId: string | undefined,
  liveReplies: RoomMessage[] = [],
  runs: readonly RoomRun[] = [],
) {
  const query = useQuery({
    queryKey: ['room-thread', roomId, rootId],
    enabled: Boolean(roomId && rootId),
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
  const replies = mergeReplies(query.data?.replies ?? [], liveReplies)
  const root =
    query.data?.root ??
    (rootId && roomId
      ? {
          id: rootId,
          roomId,
          author: { id: '', name: '' },
          text: '',
          createdAt: 0,
          attachments: [],
        }
      : undefined)
  const results = mergeResults(
    query.data?.results ?? emptyResults,
    runResultsForThread(runs, root, replies),
  )
  return {
    root: query.data?.root,
    replies,
    results,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : undefined,
    refetch: query.refetch,
  }
}
