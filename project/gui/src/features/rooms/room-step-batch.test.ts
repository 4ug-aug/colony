import { describe, expect, test } from 'bun:test'
import { mergeLatestSteps, mergeLiveSteps } from './room-step-batch'
import type { StepArrival } from './room-step-batch'
import type { Step } from '#/features/runs/step-label'

function step(id: string, idx: number, runId = 'run-1'): Step {
  return {
    id,
    runId,
    idx,
    kind: 'tool_call',
    tool: 'shell',
    text: `step ${id}`,
    createdAt: idx,
  }
}

const arrival = (value: Step): StepArrival => ({
  runId: value.runId,
  step: value,
})

describe('mergeLatestSteps', () => {
  test('keeps the last arrival per run', () => {
    const merged = mergeLatestSteps(new Map(), [
      arrival(step('a', 1)),
      arrival(step('b', 2)),
    ])
    expect(merged.get('run-1')?.id).toBe('b')
  })

  test('tracks runs independently', () => {
    const merged = mergeLatestSteps(new Map(), [
      arrival(step('a', 1, 'run-1')),
      arrival(step('b', 1, 'run-2')),
    ])
    expect(merged.get('run-1')?.id).toBe('a')
    expect(merged.get('run-2')?.id).toBe('b')
  })

  test('returns the same map for an empty batch', () => {
    const current = new Map([['run-1', step('a', 1)]])
    expect(mergeLatestSteps(current, [])).toBe(current)
  })
})

describe('mergeLiveSteps', () => {
  // The batching bug this guards: reading from `current` instead of the map
  // being built makes the second arrival overwrite the first.
  test('accumulates several arrivals for one run in a single batch', () => {
    const merged = mergeLiveSteps(new Map(), [
      arrival(step('a', 1)),
      arrival(step('b', 2)),
      arrival(step('c', 3)),
    ])
    expect(merged.get('run-1')?.map(({ id }) => id)).toEqual(['a', 'b', 'c'])
  })

  test('appends onto steps already in the map', () => {
    const current = new Map([['run-1', [step('a', 1)]]])
    const merged = mergeLiveSteps(current, [arrival(step('b', 2))])
    expect(merged.get('run-1')?.map(({ id }) => id)).toEqual(['a', 'b'])
  })

  test('replaces a step already present by id instead of duplicating it', () => {
    const revised = { ...step('a', 1), text: 'revised' }
    const merged = mergeLiveSteps(new Map([['run-1', [step('a', 1)]]]), [
      arrival(revised),
    ])
    expect(merged.get('run-1')).toHaveLength(1)
    expect(merged.get('run-1')?.[0]?.text).toBe('revised')
  })

  test('keeps runs in separate lists', () => {
    const merged = mergeLiveSteps(new Map(), [
      arrival(step('a', 1, 'run-1')),
      arrival(step('b', 1, 'run-2')),
      arrival(step('c', 2, 'run-1')),
    ])
    expect(merged.get('run-1')?.map(({ id }) => id)).toEqual(['a', 'c'])
    expect(merged.get('run-2')?.map(({ id }) => id)).toEqual(['b'])
  })

  test('does not mutate the input map', () => {
    const current = new Map([['run-1', [step('a', 1)]]])
    mergeLiveSteps(current, [arrival(step('b', 2))])
    expect(current.get('run-1')).toHaveLength(1)
  })

  test('returns the same map for an empty batch', () => {
    const current = new Map([['run-1', [step('a', 1)]]])
    expect(mergeLiveSteps(current, [])).toBe(current)
  })
})
