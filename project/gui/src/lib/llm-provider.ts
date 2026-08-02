export type LlmProvider = 'openai' | 'custom'

export const defaultLlmBaseUrl = (provider: LlmProvider) =>
  provider === 'openai' ? 'https://api.openai.com/v1' : ''

export const llmProviderName = (provider: LlmProvider) =>
  provider === 'openai' ? 'OpenAI' : 'Custom / OpenAI-compatible'
