import { expect, test } from 'bun:test'
import {
  createGrillLinkedRuns,
  type GrillLatestStep,
} from './grill-linked-runs'
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

test('grill-linked runs start follow-up and dispose the warm spine', async () => {
  const cancelled: string[] = []
  const followUps: { runId: string; task: string }[] = []
  const activities: Array<{
    grillId: string
    latestStep?: GrillLatestStep
    narration: GrillLatestStep[]
  }> = []
  let n = 0
  let stepListener:
    | ((runId: string, step: import('../../../../../runs').Step) => void)
    | undefined
  const runs = new Map<string, RunSummary>()
  const linked = createGrillLinkedRuns({
    startWarm: ({ grillId, onCreate }) => {
      const run = summary(`run-${++n}-${grillId}`, { turnActive: true })
      runs.set(run.id, run)
      return onCreate(run)
    },
    followUp: async (runId, task) => {
      followUps.push({ runId, task })
      const next = summary(runId, { task, turnActive: false, exitCode: 0 })
      runs.set(runId, next)
      return next
    },
    cancel: async (runId) => {
      cancelled.push(runId)
    },
    getRun: (runId) => runs.get(runId),
    subscribe: () => () => undefined,
    subscribeSteps: (listener) => {
      stepListener = listener
      return () => {
        stepListener = undefined
      }
    },
    onActivityChanged: (activity) => activities.push(activity),
  })

  const started = linked.start({
    grillId: 'g1',
    task: 'begin',
    agentDefinitionId: 'interviewer',
  })
  expect(linked.getRunId('g1')).toBe(started.id)
  expect(linked.getLinkedRun('g1')?.id).toBe(started.id)
  expect(linked.getLinkedRun('g1')?.turnActive).toBe(true)

  stepListener?.(started.id, {
    kind: 'message',
    text: 'I narrowed this down',
    at: 40,
  })
  stepListener?.(started.id, {
    kind: 'message',
    text: 'I narrowed this down to one decision.',
    at: 41,
  })
  stepListener?.(started.id, {
    kind: 'tool_call',
    tool: 'workspace.set_grill_frontier',
    text: '{}',
    at: 42,
  })
  expect(linked.getLatestStep('g1')).toEqual({
    kind: 'tool_call',
    tool: 'workspace.set_grill_frontier',
    text: '{}',
    at: 42,
  })
  expect(linked.getNarration('g1')).toEqual([
    {
      kind: 'message',
      text: 'I narrowed this down to one decision.',
      at: 41,
    },
  ])
  expect(activities.at(-1)).toMatchObject({
    grillId: 'g1',
    latestStep: { kind: 'tool_call' },
    narration: [{ text: 'I narrowed this down to one decision.' }],
  })

  runs.set(started.id, summary(started.id, { turnActive: false, exitCode: 0 }))
  expect(linked.getLinkedRun('g1')?.turnActive).toBe(false)

  await linked.followUp('g1', 'round answers')
  expect(followUps).toEqual([{ runId: started.id, task: 'round answers' }])
  expect(linked.getLatestStep('g1')).toBeUndefined()
  expect(linked.getNarration('g1')).toEqual([])
  expect(activities.at(-1)).toMatchObject({ grillId: 'g1', narration: [] })
  expect(linked.getLinkedRun('g1')?.turnActive).toBe(false)

  await linked.dispose('g1')
  expect(cancelled).toEqual([started.id])
  expect(linked.getRunId('g1')).toBeUndefined()
  expect(linked.getLatestStep('g1')).toBeUndefined()
  expect(linked.getNarration('g1')).toEqual([])
})

test('follow-up marks turnActive until the warm turn finishes', async () => {
  const runs = new Map<string, RunSummary>()
  let resolveFollowUp!: (value: RunSummary) => void
  const followUpPromise = new Promise<RunSummary>((resolve) => {
    resolveFollowUp = resolve
  })
  const linked = createGrillLinkedRuns({
    startWarm: ({ grillId, onCreate }) => {
      const run = summary(`run-${grillId}`, { turnActive: false, exitCode: 0 })
      runs.set(run.id, run)
      return onCreate(run)
    },
    followUp: async (runId) => {
      // Executor would set turnActive on the record; linked-runs also covers
      // the gap via followUpInFlight before that patch is visible.
      runs.set(runId, summary(runId, { turnActive: true, exitCode: 0 }))
      return followUpPromise
    },
    cancel: async () => undefined,
    getRun: (runId) => runs.get(runId),
    subscribe: () => () => undefined,
    subscribeSteps: () => () => undefined,
  })

  linked.start({
    grillId: 'g1',
    task: 'begin',
    agentDefinitionId: 'interviewer',
  })
  expect(linked.getLinkedRun('g1')?.turnActive).toBe(false)

  const pending = linked.followUp('g1', 'nudge')
  expect(linked.getLinkedRun('g1')?.turnActive).toBe(true)
  expect(linked.getLatestStep('g1')).toBeUndefined()

  const done = summary(linked.getRunId('g1')!, {
    turnActive: false,
    exitCode: 0,
  })
  runs.set(done.id, done)
  resolveFollowUp(done)
  await pending
  expect(linked.getLinkedRun('g1')?.turnActive).toBe(false)
})

test('follow-up keeps its final answer when no message step was published', async () => {
  const runs = new Map<string, RunSummary>()
  const linked = createGrillLinkedRuns({
    startWarm: ({ grillId, onCreate }) => {
      const run = summary(`run-${grillId}`, { stdout: 'Earlier answer.' })
      runs.set(run.id, run)
      return onCreate(run)
    },
    followUp: async (runId) => {
      const run = summary(runId, {
        stdout: 'Earlier answer.Can you respond to this question?',
      })
      runs.set(runId, run)
      return run
    },
    cancel: async () => undefined,
    getRun: (runId) => runs.get(runId),
    subscribe: () => () => undefined,
    subscribeSteps: () => () => undefined,
  })

  linked.start({
    grillId: 'g1',
    task: 'begin',
    agentDefinitionId: 'interviewer',
  })
  await linked.followUp('g1', 'ask without a tool')

  expect(linked.getLatestStep('g1')).toMatchObject({
    kind: 'message',
    text: 'Can you respond to this question?',
  })
  expect(linked.getNarration('g1')).toMatchObject([
    { kind: 'message', text: 'Can you respond to this question?' },
  ])
})

test('turnActive follows run.turnActive after idle exitCode is set', async () => {
  const runs = new Map<string, RunSummary>()
  const linked = createGrillLinkedRuns({
    startWarm: ({ grillId, onCreate }) => {
      const run = summary(`run-${grillId}`, { turnActive: false, exitCode: 0 })
      runs.set(run.id, run)
      return onCreate(run)
    },
    followUp: async () => undefined,
    cancel: async () => undefined,
    getRun: (runId) => runs.get(runId),
    subscribe: () => () => undefined,
    subscribeSteps: () => () => undefined,
  })

  const started = linked.start({
    grillId: 'g1',
    task: 'begin',
    agentDefinitionId: 'interviewer',
  })
  // Sticky exitCode alone must not look active.
  expect(linked.getLinkedRun('g1')?.turnActive).toBe(false)

  runs.set(started.id, summary(started.id, { turnActive: true, exitCode: 0 }))
  expect(linked.getLinkedRun('g1')?.turnActive).toBe(true)
})

test('onActivityChanged publishes linked-run steps to the Grill stream', () => {
  const activities: Array<{
    grillId: string
    linkedRunId?: string
    stepText?: string
    narration: GrillLatestStep[]
  }> = []
  const runs = new Map<string, RunSummary>()
  let stepListener:
    | ((runId: string, step: import('../../../../../runs').Step) => void)
    | undefined
  const linked = createGrillLinkedRuns({
    startWarm: ({ grillId, onCreate }) => {
      const run = summary(`run-${grillId}`, { turnActive: true })
      runs.set(run.id, run)
      return onCreate(run)
    },
    followUp: async () => undefined,
    cancel: async () => undefined,
    getRun: (runId) => runs.get(runId),
    subscribe: () => () => undefined,
    subscribeSteps: (listener) => {
      stepListener = listener
      return () => {
        stepListener = undefined
      }
    },
    onActivityChanged: (activity) => {
      activities.push({
        grillId: activity.grillId,
        ...(activity.linkedRun
          ? { linkedRunId: activity.linkedRun.id }
          : {}),
        ...(activity.latestStep
          ? { stepText: activity.latestStep.text }
          : {}),
        narration: activity.narration,
      })
    },
  })

  const started = linked.start({
    grillId: 'g1',
    task: 'begin',
    agentDefinitionId: 'interviewer',
  })
  expect(activities.at(-1)).toMatchObject({
    grillId: 'g1',
    linkedRunId: started.id,
    narration: [],
  })

  stepListener?.(started.id, {
    kind: 'message',
    text: 'thinking aloud',
    at: 9,
  })
  expect(activities.at(-1)).toMatchObject({
    grillId: 'g1',
    linkedRunId: started.id,
    stepText: 'thinking aloud',
    narration: [{ text: 'thinking aloud' }],
  })
})
