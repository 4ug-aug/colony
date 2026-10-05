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

test('namespaced tools read as a verb and object', () => {
  const label = (tool: string) => stepLabel(step({ kind: 'tool_call', tool, text: '{}' }))
  expect(label('workspace.list_issues')).toBe('is listing issues')
  expect(label('workspace_read_messages')).toBe('is reading messages')
  expect(label('github.create_pull_request')).toBe('is creating pull request in GitHub')
  expect(label('asana.get_task')).toBe('is getting task in Asana')
  expect(label('postgres.query')).toBe('is querying in Postgres')
  expect(label('web.search')).toBe('is searching the web')
  expect(label('apply_patch')).toBe('is editing files')
})

test('unknown tools fall back to "is using"', () => {
  const label = (tool?: string) => stepLabel(step({ kind: 'tool_call', tool, text: '{}' }))
  expect(label('browser')).toBe('is using browser')
  expect(label('custom_tool')).toBe('is using custom_tool')
  expect(label('acme.sync')).toBe('is syncing in acme')
})

test('exec_command shows its command', () => {
  expect(
    stepLabel(step({ kind: 'tool_call', tool: 'exec_command', text: JSON.stringify({ cmd: ['bun', 'test'] }) })),
  ).toBe('is running `bun test`')
})
