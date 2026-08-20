export type Chat = {
  id: string
  accountId: string
  agentDefinitionId: string
  title: string
  createdAt: number
  updatedAt: number
}

export type ChatMessageStep = {
  id: string
  idx: number
  kind: 'message' | 'tool_call' | 'tool_result'
  tool?: string
  callId?: string
  text: string
  createdAt: number
}

export type ChatMessage = {
  id: string
  chatId: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
  runId?: string
  steps: ChatMessageStep[]
}

export type ChatLinkedRun = {
  id: string
  state: 'preparing' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  turnActive: boolean
  error?: string
  stdout: string
}

export type ChatDetail = {
  chat: Chat
  messages: ChatMessage[]
  liveSteps: ChatMessageStep[]
  linkedRun: ChatLinkedRun | null
}
