import { useQuery } from '@tanstack/react-query'
import type { Author } from '#/features/rooms/types'
import { apiJson } from '#/lib/api-transport'

type WorkspaceMember = Pick<
  Author,
  'id' | 'name' | 'image' | 'color' | 'email' | 'displayName'
>

const workspaceMembersQueryKey = ['workspace-members'] as const

export function useWorkspaceMembers(enabled = true) {
  return useQuery({
    queryKey: workspaceMembersQueryKey,
    queryFn: async (): Promise<WorkspaceMember[]> => {
      const data = await apiJson<{ users: WorkspaceMember[] }>(
        '/api/workspace/members',
        undefined,
        'Unable to load workspace members',
      )
      return data.users
    },
    enabled,
    staleTime: 60_000,
  })
}
