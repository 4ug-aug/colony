import { expect, test } from 'bun:test'
import {
  createRoomLinkedRuns,
  mentionedAgentIds,
  mentionTaskFor,
} from './room-linked-runs'
import type { RoomMessage, RoomRun } from './room-store'
import type { RunSummary } from '#/server/features/runs/run-control'

const requestedBy = { id: 'user-1', name: 'Ada' }

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

function message(
  text: string,
  overrides: Partial<RoomMessage> = {},
): RoomMessage {
  return {
    id: 'msg-1',
    roomId: 'general',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text,
    createdAt: 1,
    attachments: [],
    ...overrides,
  }
}

test('mentionedAgentIds lists unique roster ids in order and mentionTaskFor strips that agent only', () => {
  expect(
    mentionedAgentIds(
      '@software-engineer @antboy please pair on the flaky test @antboy',
    ),
  ).toEqual(['software-engineer', 'antboy'])
  expect(
    mentionTaskFor(
      '@software-engineer @antboy please pair on the flaky test',
      'software-engineer',
    ),
  ).toBe('@antboy please pair on the flaky test')
  expect(
    mentionTaskFor(
      '@software-engineer @antboy please pair on the flaky test',
      'antboy',
    ),
  ).toBe('@software-engineer please pair on the flaky test')
  expect(mentionedAgentIds('hello @ada')).toEqual([])
})

function harness() {
  const runs = new Map<string, RunSummary>()
  const started: Array<{
    task: string
    agentDefinitionId: string
    rootId: string
    threadReadRootId?: string
    triggerMessageId: string
  }> = []
  const followUps: { runId: string; task: string }[] = []
  let n = 0
  let runListener: ((run: RunSummary) => void) | undefined
  const linked = createRoomLinkedRuns({
    startWarm: (input) => {
      started.push({
        task: input.task,
        agentDefinitionId: input.agentDefinitionId,
        rootId: input.rootId,
        ...(input.threadReadRootId
          ? { threadReadRootId: input.threadReadRootId }
          : {}),
        triggerMessageId: input.triggerMessageId,
      })
      const run = summary(`run-${++n}`, {
        task: input.task,
        agentId: input.agentDefinitionId,
        state: 'preparing',
        turnActive: true,
      })
      runs.set(run.id, run)
      const roomRun: RoomRun = {
        ...run,
        roomId: input.roomId,
        triggerMessageId: input.triggerMessageId,
        requestedBy: input.requestedBy,
      }
      return roomRun
    },
    followUp: async (runId, task) => {
      followUps.push({ runId, task })
      const next = summary(runId, {
        ...(runs.get(runId) ?? {}),
        task,
        state: 'running',
        turnActive: false,
        stdout: task,
      })
      runs.set(runId, next)
      return next
    },
    getRun: (runId) => runs.get(runId),
    subscribe: (listener) => {
      runListener = listener
      return () => {
        runListener = undefined
      }
    },
  })
  return { linked, started, followUps, runs, emit: (run: RunSummary) => runListener?.(run) }
}

test('an account message with two agent mentions starts two peer Room-linked runs without slicing the Task', () => {
  const { linked, started } = harness()
  const trigger = message(
    '@software-engineer @antboy please pair on the flaky test',
  )
  const runs = linked.dispatch({ message: trigger, requestedBy })
  expect(runs.map(({ agentId }) => agentId)).toEqual([
    'software-engineer',
    'antboy',
  ])
  expect(started).toEqual([
    {
      task: '@antboy please pair on the flaky test',
      agentDefinitionId: 'software-engineer',
      rootId: trigger.id,
      triggerMessageId: trigger.id,
    },
    {
      task: '@software-engineer please pair on the flaky test',
      agentDefinitionId: 'antboy',
      rootId: trigger.id,
      triggerMessageId: trigger.id,
    },
  ])
})

test('a later mention of the same definition in that thread followUps the warm run', async () => {
  const { linked, started, followUps, runs, emit } = harness()
  const trigger = message('@antboy first look')
  const [first] = linked.dispatch({ message: trigger, requestedBy })
  const live = summary(first!.id, {
    state: 'running',
    turnActive: false,
    stdout: 'On it.',
  })
  runs.set(live.id, live)
  emit(live)

  const reply = message('@antboy check the logs', {
    id: 'msg-2',
    rootId: trigger.id,
  })
  const again = linked.dispatch({ message: reply, requestedBy })
  expect(again.map(({ id }) => id)).toEqual([first!.id])
  expect(started).toHaveLength(1)
  await Bun.sleep(5)
  expect(followUps).toEqual([{ runId: first!.id, task: 'check the logs' }])
})

test('a recycled run is replaced by a new Room-linked run that still binds to the thread', () => {
  const { linked, started, runs, emit } = harness()
  const trigger = message('@antboy first look')
  const [first] = linked.dispatch({ message: trigger, requestedBy })
  const done = summary(first!.id, {
    state: 'succeeded',
    turnActive: false,
    stdout: 'Done.',
  })
  runs.set(done.id, done)
  emit(done)

  const reply = message('@antboy again', { id: 'msg-2', rootId: trigger.id })
  const [second] = linked.dispatch({ message: reply, requestedBy })
  expect(second!.id).not.toBe(first!.id)
  expect(started[1]).toMatchObject({
    task: 'again',
    agentDefinitionId: 'antboy',
    rootId: trigger.id,
    threadReadRootId: trigger.id,
    triggerMessageId: 'msg-2',
  })
})

test('completing one account-started peer does not followUp the other', async () => {
  const { linked, followUps, runs, emit } = harness()
  const trigger = message('@software-engineer @antboy please pair')
  const [se, antboy] = linked.dispatch({ message: trigger, requestedBy })
  const done = summary(se!.id, {
    state: 'running',
    turnActive: false,
    stdout: 'Patch ready.',
  })
  runs.set(done.id, done)
  emit(done)
  await Bun.sleep(5)
  expect(followUps).toEqual([])
  expect(linked.getLinkedRun(trigger.id, 'antboy')?.id).toBe(antboy!.id)
})

test('an agent mention followUp pings only the invoker when that run completes', async () => {
  const { linked, followUps, runs, emit } = harness()
  const trigger = message('@software-engineer start pairing')
  const [se] = linked.dispatch({ message: trigger, requestedBy })
  const seLive = summary(se!.id, {
    state: 'running',
    turnActive: false,
    stdout: 'Calling antboy.',
  })
  runs.set(seLive.id, seLive)
  emit(seLive)

  const invocation = message('@antboy take the tests', {
    id: 'msg-2',
    author: {
      kind: 'agent',
      id: 'software-engineer',
      name: 'Software engineer',
    },
    rootId: trigger.id,
  })
  const [antboy] = linked.dispatch({
    message: invocation,
    requestedBy,
    invokerAgentId: 'software-engineer',
  })
  const result = summary(antboy!.id, {
    state: 'running',
    turnActive: false,
    stdout: 'Tests are green.',
  })
  runs.set(result.id, result)
  emit(result)
  await Bun.sleep(5)
  expect(followUps).toEqual([
    { runId: se!.id, task: 'Tests are green.' },
  ])
})

test('an invocation ping queues until the invoker turn is idle', async () => {
  const { linked, followUps, runs, emit } = harness()
  const trigger = message('@software-engineer start pairing')
  const [se] = linked.dispatch({ message: trigger, requestedBy })

  const invocation = message('@antboy take the tests', {
    id: 'msg-2',
    author: {
      kind: 'agent',
      id: 'software-engineer',
      name: 'Software engineer',
    },
    rootId: trigger.id,
  })
  const [antboy] = linked.dispatch({
    message: invocation,
    requestedBy,
    invokerAgentId: 'software-engineer',
  })
  const result = summary(antboy!.id, {
    state: 'running',
    turnActive: false,
    stdout: 'Tests are green.',
  })
  runs.set(result.id, result)
  emit(result)
  await Bun.sleep(5)
  expect(followUps).toEqual([])

  const seDone = summary(se!.id, {
    state: 'running',
    turnActive: false,
    stdout: 'Posted.',
  })
  runs.set(seDone.id, seDone)
  emit(seDone)
  await Bun.sleep(5)
  expect(followUps).toEqual([
    { runId: se!.id, task: 'Tests are green.' },
  ])
})
