import { useQuery } from '@tanstack/react-query'
import { apiJson } from '#/lib/api-transport'
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
      const data = await apiJson<{ agents: AgentDefinition[] }>(
        '/api/agent-definitions',
        undefined,
        'Unable to load agent definitions',
      )
      return data.agents.map((agent) => ({
        ...agent,
        skills: agent.skills ?? [],
      }))
    },
    staleTime: 5_000,
  })
}

export function useAgentName(agentId: string) {
  const { data: agents = [] } = useAgentDefinitions()
  return agentNameFrom(agents, agentId)
}
