import { useQuery, type QueryClient } from '@tanstack/react-query'
import { apiJson, connectWorkspaceStream } from '#/lib/api-transport'
import type { WorkspaceActivityResponse } from '#/server/features/runs/workspace-activity'

export const workspaceActiveRunsQueryKey = ['workspace-active-runs'] as const

async function fetchActiveWorkspaceRuns(): Promise<WorkspaceActivityResponse> {
  return apiJson<WorkspaceActivityResponse>(
    '/api/runs/active',
    undefined,
    'Unable to load active runs',
  )
}

export function useActiveWorkspaceRuns() {
  return useQuery({
    queryKey: workspaceActiveRunsQueryKey,
    queryFn: fetchActiveWorkspaceRuns,
    refetchInterval: (query) =>
      (query.state.data?.runs.length ?? 0) > 0 ? 1_000 : 2_500,
  })
}

let detachActiveRunsWorkspaceSync: (() => void) | undefined

export function attachActiveRunsWorkspaceSync(queryClient: QueryClient) {
  detachActiveRunsWorkspaceSync?.()
  const handle = connectWorkspaceStream({
    onMessage(data) {
      const event = JSON.parse(data) as { type?: string }
      if (
        event.type === 'issue_run.created' ||
        event.type === 'issue_run.changed' ||
        event.type === 'issue_run.step' ||
        event.type === 'schedule_run.created' ||
        event.type === 'schedule_run.changed' ||
        event.type === 'schedule_run.step'
      )
        void queryClient.invalidateQueries({
          queryKey: workspaceActiveRunsQueryKey,
        })
    },
  })
  detachActiveRunsWorkspaceSync = () => handle.close()
}
