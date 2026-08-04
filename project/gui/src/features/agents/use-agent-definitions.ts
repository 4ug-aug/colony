import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '#/lib/api-transport'
import type { AgentDefinition } from '#/features/schedules/types'

export const agentDefinitionsQueryKey = ['agent-definitions'] as const

export function agentNameFrom(
  agents: readonly AgentDefinition[],
  agentId: string,
) {
  return agents.find((agent) => agent.id === agentId)?.name ?? agentId
}

export function useAgentDefinitions() {
  return useQuery({
    queryKey: agentDefinitionsQueryKey,
    queryFn: async (): Promise<AgentDefinition[]> => {
      const response = await apiFetch('/api/agent-definitions')
      if (!response.ok) throw new Error('Unable to load agent definitions')
      const data = (await response.json()) as { agents: AgentDefinition[] }
      return data.agents
    },
    staleTime: 60_000,
  })
}

export function useAgentName(agentId: string) {
  const { data: agents = [] } = useAgentDefinitions()
  return agentNameFrom(agents, agentId)
}
