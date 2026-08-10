import { useCallback, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiJson, apiJsonBody } from '#/lib/api-transport'
import { terminal } from '#/features/runs/run-helpers'
import type { OneshotRun, OneshotRunStep } from './types'

const LAST_AGENT_KEY = 'sweat.oneshot.lastAgentDefinitionId'

export function oneshotQueryKey(runId: string) {
  return ['oneshot', runId] as const
}

export function useLastOneshotAgent(fallback: string) {
  const [value, setValue] = useState(() => {
    return localStorage.getItem(LAST_AGENT_KEY) ?? fallback
  })
  const store = useCallback((next: string) => {
    setValue(next)
    localStorage.setItem(LAST_AGENT_KEY, next)
  }, [])
  return [value, store] as const
}

async function fetchOneshot(runId: string): Promise<{
  run: OneshotRun
  steps: OneshotRunStep[]
}> {
  const data = await apiJson<{ run?: OneshotRun; steps?: OneshotRunStep[] }>(
    `/api/oneshots/${encodeURIComponent(runId)}`,
    undefined,
    'Unable to load Oneshot',
  )
  if (!data.run) throw new Error('Unable to load Oneshot')
  return { run: data.run, steps: data.steps ?? [] }
}

export function useOneshot(runId: string | undefined) {
  return useQuery({
    queryKey: runId ? oneshotQueryKey(runId) : ['oneshot', 'none'],
    queryFn: () => fetchOneshot(runId!),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const state = query.state.data?.run.state
      if (!state || terminal(state)) return false
      return 750
    },
  })
}

export function useStartOneshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      task: string
      agentDefinitionId: string
      repositoryBase?: string
    }): Promise<OneshotRun> => {
      const data = await apiJsonBody<{ run?: OneshotRun }>(
        '/api/oneshots',
        'POST',
        {
          task: input.task,
          agentDefinitionId: input.agentDefinitionId,
          ...(input.repositoryBase
            ? { repositoryBase: input.repositoryBase }
            : {}),
        },
        'Unable to start Oneshot',
      )
      if (!data.run) throw new Error('Unable to start Oneshot')
      return data.run
    },
    onSuccess: (run) => {
      queryClient.setQueryData(oneshotQueryKey(run.id), {
        run,
        steps: [] as OneshotRunStep[],
      })
    },
  })
}

export function useDiscardOneshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (runId: string): Promise<void> => {
      await apiJsonBody(
        `/api/oneshots/${encodeURIComponent(runId)}`,
        'DELETE',
        {},
        'Unable to close Oneshot',
      )
    },
    onSuccess: (_void, runId) => {
      queryClient.removeQueries({ queryKey: oneshotQueryKey(runId) })
    },
  })
}
