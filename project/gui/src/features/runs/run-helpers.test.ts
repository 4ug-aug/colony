import { describe, expect, test } from 'bun:test'
import type { RoomRun } from '#/features/rooms/types'
import type { Step } from './step-label'
import { runStatus, runTurnInFlight } from './run-helpers'

const run = (overrides: Partial<RoomRun> = {}): RoomRun => ({
  id: 'run-1',
  roomId: 'general',
  triggerMessageId: 'msg-1',
  requestedBy: { id: 'user-1', name: 'Ada' },
  agentId: 'antboy',
  task: 'what can you do',
  provider: 'cursor',
  model: 'gpt',
  state: 'running',
  createdAt: 1,
  stdout: '',
  ...overrides,
})

const reasoning: Step = {
  id: 'step-1',
  runId: 'run-1',
  idx: 0,
  kind: 'message',
  text: 'thinking',
  createdAt: 1,
}

describe('runTurnInFlight', () => {
  test('true while a turn is preparing, running, or marked turnActive', () => {
    expect(runTurnInFlight(run({ state: 'preparing' }))).toBe(true)
    expect(runTurnInFlight(run())).toBe(true)
    expect(
      runTurnInFlight(
        run({
          turnActive: true,
          exitCode: 0,
          stdout: 'I can review PRs.',
        }),
      ),
    ).toBe(true)
  })

  test('false for a warm run whose turn already produced a successful result', () => {
    expect(
      runTurnInFlight(
        run({
          exitCode: 0,
          stdout: 'I can review PRs.',
        }),
      ),
    ).toBe(false)
    expect(runTurnInFlight(run({ turnActive: false }))).toBe(false)
    expect(runTurnInFlight(run({ state: 'succeeded' }))).toBe(false)
  })
})

describe('runStatus', () => {
  test('does not keep a completed warm turn in reasoning', () => {
    expect(
      runStatus(
        run({
          exitCode: 0,
          stdout: 'I can review PRs.',
        }),
        reasoning,
      ),
    ).toBe('completed')
  })

  test('keeps live step copy while a turn is in flight', () => {
    expect(runStatus(run({ turnActive: true }), reasoning)).toBe('is reasoning')
  })
})
