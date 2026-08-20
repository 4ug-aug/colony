import { expect, test } from 'bun:test'
import {
  createChatLinkedRuns,
  type ChatTurnComplete,
} from './chat-linked-runs'
import type { RunSummary } from '#/server/features/runs/run-control'

const summary = (
  id: string,
  overrides: Partial<RunSummary> = {},
): RunSummary => ({
  id,
  task: 't',
  state: 'running',
  createdAt: 1,
  agentId: 'a',
  provider: 'openai',
  model: 'm',
  stdout: '',
  stderr: '',
  ...overrides,
})

test('chat-linked runs start, stream steps, complete a turn, and follow up', async () => {
  const cancelled: string[] = []
  const completed: ChatTurnComplete[] = []
  const runs = new Map<string, RunSummary>()
  let n = 0
  let runListener: ((run: RunSummary) => void) | undefined
  let stepListener:
    | ((runId: string, step: import('../../../../../runs').Step) => void)
    | undefined
  const linked = createChatLinkedRuns({
    startWarm: ({ chatId, onCreate }) => {
      const run = summary(`run-${++n}-${chatId}`, { turnActive: true })
      runs.set(run.id, run)
      return onCreate(run)
    },
    followUp: async (runId, task) => {
      const next = summary(runId, {
        task,
        turnActive: false,
        stdout: 'Later answer.',
      })
      runs.set(runId, next)
      return next
    },
    cancel: async (runId) => {
      cancelled.push(runId)
    },
    getRun: (runId) => runs.get(runId),
    subscribe: (listener) => {
      runListener = listener
      return () => {
        runListener = undefined
      }
    },
    subscribeSteps: (listener) => {
      stepListener = listener
      return () => {
        stepListener = undefined
      }
    },
    onTurnComplete: (turn) => completed.push(turn),
  })

  const started = linked.start({
    chatId: 'c1',
    task: 'hello',
    agentDefinitionId: 'antboy',
  })
  expect(linked.getLinkedRun('c1')?.turnActive).toBe(true)

  stepListener?.(started.id, {
    kind: 'tool_call',
    tool: 'shell',
    text: '{}',
    at: 2,
  })
  stepListener?.(started.id, {
    kind: 'message',
    text: 'Hi there.',
    at: 3,
  })
  expect(linked.getTurnSteps('c1')).toHaveLength(2)

  const done = summary(started.id, {
    turnActive: false,
    stdout: 'Hi there.',
  })
  runs.set(started.id, done)
  runListener?.(done)
  expect(completed).toHaveLength(1)
  expect(completed[0]).toMatchObject({
    chatId: 'c1',
    text: 'Hi there.',
    steps: [{ tool: 'shell' }, { kind: 'message', text: 'Hi there.' }],
  })
  expect(linked.getTurnSteps('c1')).toEqual([])
  expect(linked.getLinkedRun('c1')?.turnActive).toBe(false)

  await linked.followUp('c1', 'again')
  expect(completed[1]).toMatchObject({
    chatId: 'c1',
    text: 'Later answer.',
  })

  await linked.dispose('c1')
  expect(cancelled).toEqual([started.id])
  expect(linked.getLinkedRun('c1')).toBeUndefined()
})
