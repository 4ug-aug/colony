import { expect, test } from 'bun:test'
import { stepLabel } from './step-label'

// Minimal Step fixture
function step(overrides: Partial<Parameters<typeof stepLabel>[0]>): Parameters<typeof stepLabel>[0] {
  return {
    id: 'test-id',
    runId: 'run-1',
    roomId: 'room-1',
    idx: 0,
    kind: 'message',
    text: '',
    createdAt: 0,
    ...overrides,
  }
}

test('message kind returns "is reasoning"', () => {
  expect(stepLabel(step({ kind: 'message', text: 'thinking...' }))).toBe('is reasoning')
})

test('tool_result kind returns "is working"', () => {
  expect(stepLabel(step({ kind: 'tool_result', text: 'ok' }))).toBe('is working')
})

test('tool_call shell with command truncated to 40 chars', () => {
  const cmd = 'echo hello'
  expect(stepLabel(step({ kind: 'tool_call', tool: 'shell', text: JSON.stringify({ command: cmd }) }))).toBe(
    `is running \`${cmd}\``,
  )
})

test('tool_call shell with long command is truncated at 40 chars', () => {
  const long = 'x'.repeat(60)
  const result = stepLabel(step({ kind: 'tool_call', tool: 'shell', text: JSON.stringify({ command: long }) }))
  expect(result).toBe(`is running \`${'x'.repeat(40)}\``)
})

test('tool_call shell with invalid JSON falls back to "is using shell"', () => {
  expect(stepLabel(step({ kind: 'tool_call', tool: 'shell', text: 'not json' }))).toBe('is using shell')
})

test('tool_call other tool uses part before first dot', () => {
  expect(stepLabel(step({ kind: 'tool_call', tool: 'linear.issues.get', text: '{}' }))).toBe('is using linear')
})

test('tool_call tool with no dot uses full name', () => {
  expect(stepLabel(step({ kind: 'tool_call', tool: 'browser', text: '{}' }))).toBe('is using browser')
})

test('tool_call with no tool field uses empty string humanized', () => {
  expect(stepLabel(step({ kind: 'tool_call', tool: undefined, text: '{}' }))).toBe('is using ')
})
