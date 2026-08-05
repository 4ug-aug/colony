import { useQuery } from '@tanstack/react-query'
import type { Author } from '#/features/rooms/types'
import { apiFetch } from '#/lib/api-transport'

export type WorkspaceMember = Pick<
  Author,
  'id' | 'name' | 'image' | 'email' | 'displayName'
>

export const workspaceMembersQueryKey = ['workspace-members'] as const

export function useWorkspaceMembers(enabled = true) {
  return useQuery({
    queryKey: workspaceMembersQueryKey,
    queryFn: async (): Promise<WorkspaceMember[]> => {
      const response = await apiFetch('/api/workspace/members')
      if (!response.ok) throw new Error('Unable to load workspace members')
      const data = (await response.json()) as { users: WorkspaceMember[] }
      return data.users
    },
    enabled,
    staleTime: 60_000,
  })
}
