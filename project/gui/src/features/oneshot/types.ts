export type OneshotRun = {
  id: string
  oneshotId: string
  accountId: string
  task: string
  agentId: string
  provider: 'openai' | 'custom' | 'cursor'
  model: string
  state: 'preparing' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  createdAt: number
  startedAt?: number
  completedAt?: number
  exitCode?: number
  turnActive?: boolean
  error?: string
  stdout: string
  stderr: string
  repositoryBase?: string
}

export type OneshotRunStep = {
  id: string
  runId: string
  idx: number
  kind: 'message' | 'tool_call' | 'tool_result'
  tool?: string
  callId?: string
  text: string
  createdAt: number
  at: number
}
