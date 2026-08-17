import { describe, expect, test } from 'bun:test'
import type { Step } from '#/features/runs/step-label'
import { oneshotPeeks } from './oneshot-tool-peeks'

const step = (
  values: Partial<Step> & Pick<Step, 'id' | 'idx' | 'kind'>,
): Step => ({
  runId: 'run-1',
  text: '',
  createdAt: values.idx,
  ...values,
})

const issueJson = (issue: { id: string; number: number; title: string }) =>
  JSON.stringify(issue, null, 2)

const createCall = (
  id: string,
  idx: number,
  tool: string,
  callId: string,
  args = '{}',
) =>
  step({
    id,
    idx,
    kind: 'tool_call',
    tool,
    callId,
    text: args,
  })

const createResult = (id: string, idx: number, callId: string, text: string) =>
  step({
    id,
    idx,
    kind: 'tool_result',
    callId,
    text,
  })

describe('oneshotPeeks', () => {
  test('empty and unrelated tools yield no peeks', () => {
    expect(oneshotPeeks([])).toEqual([])
    expect(
      oneshotPeeks([
        createCall('call', 0, 'shell', 'c1'),
        createResult('result', 1, 'c1', 'ok'),
      ]),
    ).toEqual([])
  })

  test('successful create_issue peeks for dotted and underscored names', () => {
    const result = issueJson({
      id: 'issue-1',
      number: 12,
      title: 'Dock badge',
    })
    const peek = {
      key: 'issue-1',
      label: 'COL-12 Dock badge',
      tool: 'workspace.create_issue',
      issueId: 'issue-1',
    }
    expect(
      oneshotPeeks([
        createCall('call', 0, 'workspace.create_issue', 'c1'),
        createResult('result', 1, 'c1', result),
      ]),
    ).toEqual([peek])
    expect(
      oneshotPeeks([
        createCall('call', 0, 'workspace_create_issue', 'c1'),
        createResult('result', 1, 'c1', result),
      ]),
    ).toEqual([peek])
  })

  test('successful Asana create_task peeks link to the created task', () => {
    expect(
      oneshotPeeks([
        createCall('call', 0, 'asana_create_task', 'c1'),
        createResult(
          'result',
          1,
          'c1',
          JSON.stringify({
            data: {
              gid: 'task-1',
              name: 'Ship it',
              permalink_url: 'https://app.asana.com/0/1/task-1',
            },
          }),
        ),
      ]),
    ).toEqual([
      {
        key: 'task-1',
        label: 'Ship it',
        tool: 'asana.create_task',
        href: 'https://app.asana.com/0/1/task-1',
      },
    ])
  })

  test('reads toolName from call args when step.tool is missing', () => {
    expect(
      oneshotPeeks([
        createCall(
          'call',
          0,
          '',
          'c1',
          JSON.stringify({ toolName: 'workspace.create_issue' }),
        ),
        createResult(
          'result',
          1,
          'c1',
          issueJson({ id: 'issue-2', number: 2, title: 'From args' }),
        ),
      ]),
    ).toEqual([
      {
        key: 'issue-2',
        label: 'COL-2 From args',
        tool: 'workspace.create_issue',
        issueId: 'issue-2',
      },
    ])
  })

  test('unwraps MCP content text once', () => {
    const issue = { id: 'issue-3', number: 3, title: 'Wrapped' }
    expect(
      oneshotPeeks([
        createCall('call', 0, 'workspace.create_issue', 'c1'),
        createResult(
          'result',
          1,
          'c1',
          JSON.stringify({
            content: [{ type: 'text', text: issueJson(issue) }],
          }),
        ),
      ]),
    ).toEqual([
      {
        key: 'issue-3',
        label: 'COL-3 Wrapped',
        tool: 'workspace.create_issue',
        issueId: 'issue-3',
      },
    ])
  })

  test('unwraps the single MCP text item emitted by OpenAI', () => {
    const issue = { id: 'issue-4', number: 4, title: 'From OpenAI' }
    expect(
      oneshotPeeks([
        createCall('call', 0, 'workspace_create_issue', 'c1'),
        createResult(
          'result',
          1,
          'c1',
          JSON.stringify({ type: 'text', text: issueJson(issue) }),
        ),
      ]),
    ).toEqual([
      {
        key: 'issue-4',
        label: 'COL-4 From OpenAI',
        tool: 'workspace.create_issue',
        issueId: 'issue-4',
      },
    ])
  })

  test('unwraps Cursor mcp envelope and toolName on mcp calls', () => {
    const issue = {
      id: '65f9ac68-47b6-4b94-be9d-24397f7ca1f3',
      number: 15,
      title: 'Test colony issue',
    }
    expect(
      oneshotPeeks([
        createCall(
          'call',
          0,
          'mcp',
          'c1',
          JSON.stringify({
            providerIdentifier: 'sweat',
            toolName: 'workspace.create_issue',
            args: { title: issue.title },
          }),
        ),
        createResult(
          'result',
          1,
          'c1',
          JSON.stringify({
            status: 'success',
            value: {
              content: [{ text: { text: issueJson(issue) } }],
              isError: false,
            },
          }),
        ),
      ]),
    ).toEqual([
      {
        key: issue.id,
        label: 'COL-15 Test colony issue',
        tool: 'workspace.create_issue',
        issueId: issue.id,
      },
    ])
  })

  test('failed, pending, and unparseable results yield no peek', () => {
    expect(
      oneshotPeeks([createCall('call', 0, 'workspace.create_issue', 'c1')]),
    ).toEqual([])
    expect(
      oneshotPeeks([
        createCall('call', 0, 'workspace.create_issue', 'c1'),
        createResult(
          'result',
          1,
          'c1',
          "Tool 'workspace.create_issue' not found.",
        ),
      ]),
    ).toEqual([])
    expect(
      oneshotPeeks([
        createCall('call', 0, 'workspace.create_issue', 'c1'),
        createResult('result', 1, 'c1', 'not json'),
      ]),
    ).toEqual([])
    expect(
      oneshotPeeks([
        createCall('call', 0, 'workspace.create_issue', 'c1'),
        createResult('result', 1, 'c1', JSON.stringify({ title: 'No id' })),
      ]),
    ).toEqual([])
    expect(
      oneshotPeeks([
        createCall('call', 0, 'workspace.create_issue', 'c1'),
        createResult(
          'result',
          1,
          'c1',
          JSON.stringify({
            status: 'success',
            value: { content: [{ text: { text: 'err' } }], isError: true },
          }),
        ),
      ]),
    ).toEqual([])
  })

  test('two creates yield two peeks with stable keys', () => {
    expect(
      oneshotPeeks([
        createCall('call-a', 0, 'workspace.create_issue', 'c1'),
        createResult(
          'result-a',
          1,
          'c1',
          issueJson({ id: 'issue-a', number: 1, title: 'First' }),
        ),
        createCall('call-b', 2, 'workspace.create_issue', 'c2'),
        createResult(
          'result-b',
          3,
          'c2',
          issueJson({ id: 'issue-b', number: 2, title: 'Second' }),
        ),
      ]),
    ).toEqual([
      {
        key: 'issue-a',
        label: 'COL-1 First',
        tool: 'workspace.create_issue',
        issueId: 'issue-a',
      },
      {
        key: 'issue-b',
        label: 'COL-2 Second',
        tool: 'workspace.create_issue',
        issueId: 'issue-b',
      },
    ])
  })
})
