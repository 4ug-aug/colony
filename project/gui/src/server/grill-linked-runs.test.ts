import { expect, test } from 'bun:test'
import { createGrillLinkedRuns } from './grill-linked-runs'
import type { RunSummary } from './run-control'

const summary = (id: string): RunSummary => ({
  id,
  task: 't',
  state: 'running',
  createdAt: 1,
  agentId: 'a',
  provider: 'openai',
  model: 'm',
  stdout: '',
  stderr: '',
})

test('grill-linked runs start follow-up and dispose the warm spine', async () => {
  const cancelled: string[] = []
  const followUps: { runId: string; task: string }[] = []
  let n = 0
  let stepListener: ((runId: string, step: import('../../../runs').Step) => void) | undefined
  const linked = createGrillLinkedRuns({
    startWarm: ({ grillId, onCreate }) => {
      const run = summary(`run-${++n}-${grillId}`)
      return onCreate(run)
    },
    followUp: async (runId, task) => {
      followUps.push({ runId, task })
      return summary(runId)
    },
    cancel: async (runId) => {
      cancelled.push(runId)
    },
    getRun: (runId) => summary(runId),
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

  await linked.followUp('g1', 'round answers')
  expect(followUps).toEqual([{ runId: started.id, task: 'round answers' }])
  expect(linked.getLatestStep('g1')).toBeUndefined()

  await linked.dispose('g1')
  expect(cancelled).toEqual([started.id])
  expect(linked.getRunId('g1')).toBeUndefined()
  expect(linked.getLatestStep('g1')).toBeUndefined()
})
