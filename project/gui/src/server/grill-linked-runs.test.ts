import { expect, test } from 'bun:test'
import { createGrillLinkedRuns } from './grill-linked-runs'
import type { RunSummary } from './run-control'

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
  let n = 0
  let stepListener: ((runId: string, step: import('../../../runs').Step) => void) | undefined
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
    subscribeSteps: (listener) => {
      stepListener = listener
      return () => {
        stepListener = undefined
      }
    },
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

  runs.set(started.id, summary(started.id, { turnActive: false, exitCode: 0 }))
  expect(linked.getLinkedRun('g1')?.turnActive).toBe(false)

  await linked.followUp('g1', 'round answers')
  expect(followUps).toEqual([{ runId: started.id, task: 'round answers' }])
  expect(linked.getLatestStep('g1')).toBeUndefined()
  expect(linked.getLinkedRun('g1')?.turnActive).toBe(false)

  await linked.dispose('g1')
  expect(cancelled).toEqual([started.id])
  expect(linked.getRunId('g1')).toBeUndefined()
  expect(linked.getLatestStep('g1')).toBeUndefined()
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

  const done = summary(linked.getRunId('g1')!, { turnActive: false, exitCode: 0 })
  runs.set(done.id, done)
  resolveFollowUp(done)
  await pending
  expect(linked.getLinkedRun('g1')?.turnActive).toBe(false)
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
