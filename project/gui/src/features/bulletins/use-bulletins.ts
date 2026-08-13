import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson, apiJsonBody } from '#/lib/api-transport'
import type { Bulletin, Poll } from './types'

const bulletinsQueryKey = ['bulletins'] as const

function upsertBulletin(bulletins: Bulletin[], bulletin: Bulletin): Bulletin[] {
  const index = bulletins.findIndex(({ id }) => id === bulletin.id)
  if (index < 0) return [...bulletins, bulletin]
  return bulletins.map((current) =>
    current.id === bulletin.id ? bulletin : current,
  )
}

export function upsertBulletinInCache(
  queryClient: QueryClient,
  bulletin: Bulletin,
) {
  queryClient.setQueryData(
    bulletinsQueryKey,
    (current: Bulletin[] | undefined) =>
      upsertBulletin(current ?? [], bulletin),
  )
}

export function removeBulletinFromCache(
  queryClient: QueryClient,
  bulletinId: string,
) {
  queryClient.setQueryData(
    bulletinsQueryKey,
    (current: Bulletin[] | undefined) => {
      if (!current) return current
      return current.filter((bulletin) => bulletin.id !== bulletinId)
    },
  )
}

async function fetchBulletins(): Promise<Bulletin[]> {
  const data = await apiJson<{ bulletins: Bulletin[] }>(
    '/api/bulletins',
    undefined,
    'Unable to load bulletins',
  )
  return data.bulletins
}

export function useBulletins(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: bulletinsQueryKey,
    queryFn: fetchBulletins,
    enabled: options?.enabled ?? true,
  })
}

export function useCreateBulletin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      body?: string
      x?: number
      y?: number
    }): Promise<Bulletin> => {
      const data = await apiJsonBody<{ bulletin?: Bulletin }>(
        '/api/bulletins',
        'POST',
        {
          body: input.body ?? '',
          ...(input.x !== undefined ? { x: input.x } : {}),
          ...(input.y !== undefined ? { y: input.y } : {}),
        },
        'Unable to create bulletin',
      )
      if (!data.bulletin) throw new Error('Unable to create bulletin')
      return data.bulletin
    },
    onSuccess: (bulletin) => {
      upsertBulletinInCache(queryClient, bulletin)
    },
  })
}

export function useUpdateBulletin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      body?: string
      x?: number
      y?: number
      poll?: Poll | null
    }): Promise<Bulletin> => {
      const { id, ...patch } = input
      const data = await apiJsonBody<{ bulletin?: Bulletin }>(
        `/api/bulletins/${id}`,
        'PATCH',
        patch,
        'Unable to update bulletin',
      )
      if (!data.bulletin) throw new Error('Unable to update bulletin')
      return data.bulletin
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: bulletinsQueryKey })
      const previous = queryClient.getQueryData<Bulletin[]>(bulletinsQueryKey)
      if (previous) {
        const current = previous.find((item) => item.id === input.id)
        if (current) {
          upsertBulletinInCache(queryClient, {
            ...current,
            ...(input.body !== undefined ? { body: input.body } : {}),
            ...(input.x !== undefined ? { x: input.x } : {}),
            ...(input.y !== undefined ? { y: input.y } : {}),
            ...(input.poll !== undefined ? { poll: input.poll } : {}),
          })
        }
      }
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous)
        queryClient.setQueryData(bulletinsQueryKey, context.previous)
    },
    onSuccess: (bulletin) => {
      upsertBulletinInCache(queryClient, bulletin)
    },
  })
}

export function useVoteBulletin(currentUserId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      options: number[] | null
    }): Promise<Bulletin> => {
      const data = await apiJsonBody<{ bulletin?: Bulletin }>(
        `/api/bulletins/${input.id}/vote`,
        'POST',
        { options: input.options },
        'Unable to vote',
      )
      if (!data.bulletin) throw new Error('Unable to vote')
      return data.bulletin
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: bulletinsQueryKey })
      const previous = queryClient.getQueryData<Bulletin[]>(bulletinsQueryKey)
      const current = previous?.find((item) => item.id === input.id)
      if (current?.poll) {
        const votes = { ...current.poll.votes }
        if (input.options === null) delete votes[currentUserId]
        else votes[currentUserId] = input.options
        upsertBulletinInCache(queryClient, {
          ...current,
          poll: { ...current.poll, votes },
        })
      }
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous)
        queryClient.setQueryData(bulletinsQueryKey, context.previous)
    },
    onSuccess: (bulletin) => {
      upsertBulletinInCache(queryClient, bulletin)
    },
  })
}

export function useDeleteBulletin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiJsonBody(
        `/api/bulletins/${id}`,
        'DELETE',
        undefined,
        'Unable to delete bulletin',
      )
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: bulletinsQueryKey })
      const previous = queryClient.getQueryData<Bulletin[]>(bulletinsQueryKey)
      removeBulletinFromCache(queryClient, id)
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous)
        queryClient.setQueryData(bulletinsQueryKey, context.previous)
    },
  })
}
