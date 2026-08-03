/** Provider recorded on a run: OpenAI-compatible LLM endpoint or Cursor agent runtime. */
export type RuntimeProvider = 'openai' | 'custom' | 'cursor'

export type LlmProvider = 'openai' | 'custom'

export const defaultLlmBaseUrl = (provider: LlmProvider) =>
  provider === 'openai' ? 'https://api.openai.com/v1' : ''

export const llmProviderName = (provider: RuntimeProvider) => {
  if (provider === 'cursor') return 'Cursor'
  if (provider === 'openai') return 'OpenAI'
  return 'Custom / OpenAI-compatible'
}
