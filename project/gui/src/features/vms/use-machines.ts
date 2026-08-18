import { apiJson, apiJsonBody } from '#/lib/api-transport'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Machine } from './types'

const queryKey = ['vms'] as const

export function useMachines() {
  return useQuery({
    queryKey,
    queryFn: () =>
      apiJson<{ machines: Machine[] }>(
        '/api/vms',
        undefined,
        'Could not load machines',
      ),
    refetchInterval: 2_000,
  })
}

export function useNukeMachine(onNuked?: (id: string) => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiJsonBody<{ id: string }>(
        `/api/vms/${encodeURIComponent(id)}`,
        'DELETE',
        undefined,
        'Could not nuke machine',
      ),
    onSuccess: ({ id }) => {
      queryClient.setQueryData<{ machines: Machine[] }>(
        queryKey,
        (current) => ({
          machines:
            current?.machines.filter((machine) => machine.id !== id) ?? [],
        }),
      )
      onNuked?.(id)
    },
  })
}
