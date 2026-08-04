export type AgentDefinition = {
  id: string
  name: string
  description: string
  kind?: 'cursor' | 'openai-agents'
  icon: string
  capabilities: { id: string; name: string; tools: string[] }[]
}
export type Schedule = {
  id: string
  name: string
  agentDefinitionId: string
  task: string
  cronExpression: string
  timezone: string
  state: 'active' | 'paused' | 'archived'
  createdBy: { id: string; name: string; image?: string }
  createdAt: number
  updatedAt: number
  nextRunAt?: number
}
export type ScheduleRun = {
  id: string
  scheduleId: string
  source: 'automatic' | 'manual'
  scheduledFor?: number
  startedBy?: { id: string; name: string; image?: string }
  task: string
  agentId: string
  provider: 'openai' | 'custom' | 'cursor'
  model: string
  state: 'preparing' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  createdAt: number
  completedAt?: number
  error?: string
}
