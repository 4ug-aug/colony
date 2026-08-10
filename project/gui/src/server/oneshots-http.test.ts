import { expect, test } from 'bun:test'
import { createOneshotStore } from './oneshot-store'
import { createOneshotRunner, OneshotActiveRunError } from './oneshot-runner'
import { createOneshotsHttp } from './oneshots-http'
import type { RunControl, RunSummary } from './run-control'
import type { WorkspaceAgentStartRunRequest } from '../../../agents/roster'

const baseSummary = (overrides: Partial<RunSummary> = {}): RunSummary => ({
  id: 'run-1',
  task: 'do the thing',
  state: 'preparing',
  createdAt: 1,
  stdout: '',
  stderr: '',
  agentId: 'antboy',
  provider: 'openai',
  model: 'm',
  ...overrides,
})

function fakeControl(
  capture?: (request: WorkspaceAgentStartRunRequest) => void,
): RunControl {
  const listeners = new Set<(run: RunSummary) => void>()
  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    subscribeSteps: () => () => {},
    getRun: () => undefined,
    start: (task, context) => {
      capture?.({
        task,
        agentDefinitionId: context.agentDefinitionId ?? 'software-engineer',
        grantContext:
          'oneshotId' in context
            ? {
                oneshotId: context.oneshotId,
                agentDefinitionId: context.agentDefinitionId,
                ...('repositoryBase' in context && context.repositoryBase
                  ? { repositoryBase: context.repositoryBase }
                  : {}),
              }
            : {},
      } as WorkspaceAgentStartRunRequest)
      return context.onCreate(
        baseSummary({
          task,
          agentId: context.agentDefinitionId ?? 'software-engineer',
        }),
      )
    },
    followUp: async () => undefined,
    cancel: async (runId) =>
      baseSummary({ id: runId, state: 'cancelled', completedAt: 2 }),
    stop: async () => {},
  }
}

test('oneshot store enforces one active run per account', () => {
  const store = createOneshotStore()
  const first = store.createRun({
    ...baseSummary(),
    oneshotId: 'o1',
    accountId: 'user-1',
  })
  expect(first).toBeDefined()
  expect(
    store.createRun({
      ...baseSummary({ id: 'run-2' }),
      oneshotId: 'o2',
      accountId: 'user-1',
    }),
  ).toBeUndefined()
  expect(
    store.createRun({
      ...baseSummary({ id: 'run-3' }),
      oneshotId: 'o3',
      accountId: 'user-2',
    }),
  ).toBeDefined()
})

test('oneshot store discard is private to account', () => {
  const store = createOneshotStore()
  store.createRun({
    ...baseSummary(),
    oneshotId: 'o1',
    accountId: 'user-1',
  })
  expect(store.discard('run-1', 'user-2')).toBeUndefined()
  expect(store.getRun('run-1')).toBeDefined()
  expect(store.discard('run-1', 'user-1')?.id).toBe('run-1')
  expect(store.getRun('run-1')).toBeUndefined()
})

test('oneshot runner starts with oneshot grant context', () => {
  let request: WorkspaceAgentStartRunRequest | undefined
  const runner = createOneshotRunner({
    control: fakeControl((value) => {
      request = value
    }),
  })
  const run = runner.start({
    accountId: 'user-1',
    task: 'create an Issue',
    agentDefinitionId: 'antboy',
    repositoryBase: 'main',
  })
  expect(run.accountId).toBe('user-1')
  expect(run.oneshotId).toBeTruthy()
  expect(request?.grantContext).toMatchObject({
    oneshotId: run.oneshotId,
    agentDefinitionId: 'antboy',
    repositoryBase: 'main',
  })
})

test('oneshot runner rejects second active run', () => {
  const runner = createOneshotRunner({ control: fakeControl() })
  runner.start({
    accountId: 'user-1',
    task: 'first',
    agentDefinitionId: 'antboy',
  })
  expect(() =>
    runner.start({
      accountId: 'user-1',
      task: 'second',
      agentDefinitionId: 'antboy',
    }),
  ).toThrow(OneshotActiveRunError)
})

test('oneshots HTTP starts, reads privately, and discards', async () => {
  const runner = createOneshotRunner({ control: fakeControl() })
  const http = createOneshotsHttp({
    oneshotRunner: runner,
    agentDefinitions: () => [
      {
        id: 'antboy',
        name: 'Antboy',
        description: '',
        icon: 'bot',
        includeRepository: false,
        capabilities: [],
        skills: [],
      },
      {
        id: 'software-engineer',
        name: 'Software engineer',
        description: '',
        icon: 'bot',
        includeRepository: true,
        capabilities: [],
        skills: [],
      },
    ],
  })
  const user = { id: 'user-1', name: 'Ada' }
  const other = { id: 'user-2', name: 'Bob' }

  const started = await http(
    new Request('http://localhost/api/oneshots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'find the on-call',
        agentDefinitionId: 'antboy',
      }),
    }),
    new URL('http://localhost/api/oneshots'),
    user,
  )
  expect(started?.status).toBe(202)
  const body = (await started!.json()) as { run: { id: string } }
  const runId = body.run.id

  const denied = await http(
    new Request(`http://localhost/api/oneshots/${runId}`),
    new URL(`http://localhost/api/oneshots/${runId}`),
    other,
  )
  expect(denied?.status).toBe(404)

  const got = await http(
    new Request(`http://localhost/api/oneshots/${runId}`),
    new URL(`http://localhost/api/oneshots/${runId}`),
    user,
  )
  expect(got?.status).toBe(200)

  const discarded = await http(
    new Request(`http://localhost/api/oneshots/${runId}`, {
      method: 'DELETE',
    }),
    new URL(`http://localhost/api/oneshots/${runId}`),
    user,
  )
  expect(discarded?.status).toBe(200)
  expect(runner.get(runId, user.id)).toBeUndefined()
})

test('oneshots HTTP rejects revision for non-repository agents', async () => {
  const runner = createOneshotRunner({ control: fakeControl() })
  const http = createOneshotsHttp({
    oneshotRunner: runner,
    agentDefinitions: () => [
      {
        id: 'antboy',
        name: 'Antboy',
        description: '',
        icon: 'bot',
        includeRepository: false,
        capabilities: [],
        skills: [],
      },
    ],
  })
  const response = await http(
    new Request('http://localhost/api/oneshots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'look something up',
        agentDefinitionId: 'antboy',
        repositoryBase: 'main',
      }),
    }),
    new URL('http://localhost/api/oneshots'),
    { id: 'user-1', name: 'Ada' },
  )
  expect(response?.status).toBe(400)
})
