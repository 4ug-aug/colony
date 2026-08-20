import { expect, test } from 'bun:test'
import { agentMarkClass, isAgentMentionId } from './agent-color'

test('known agents map to distinct Colony mark tokens', () => {
  expect(agentMarkClass('software-engineer')).toBe('text-primary')
  expect(agentMarkClass('antboy')).toBe('text-amber-600 dark:text-amber-400')
})

test('unknown agent ids hash stably into fallback mark tokens', () => {
  expect(agentMarkClass('other')).toBe(agentMarkClass('other'))
  expect(agentMarkClass('other').startsWith('text-')).toBe(true)
})

test('named agent ids are mention agents even before definitions load', () => {
  expect(isAgentMentionId('antboy')).toBe(true)
  expect(isAgentMentionId('software-engineer')).toBe(true)
  expect(isAgentMentionId('ada')).toBe(false)
  expect(isAgentMentionId('ada', ['ada-bot'])).toBe(false)
  expect(isAgentMentionId('ada-bot', ['ada-bot'])).toBe(true)
})
