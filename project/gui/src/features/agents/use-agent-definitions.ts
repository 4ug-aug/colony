import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '#/lib/api-transport'
import type { AgentDefinition } from '#/features/schedules/types'

export function useAgentDefinitions() {
  return useQuery({
    queryKey: ['agent-definitions'],
    queryFn: async (): Promise<AgentDefinition[]> => {
      const response = await apiFetch('/api/agent-definitions')
      if (!response.ok) throw new Error('Unable to load agent definitions')
      const data = (await response.json()) as { agents: AgentDefinition[] }
      return data.agents
    },
    staleTime: 60_000,
  })
}
