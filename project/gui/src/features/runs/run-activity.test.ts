import { describe, expect, test } from 'bun:test'
import {
  formatStepText,
  groupActivity,
  mergeSteps,
  pairSteps,
} from './run-activity'
import type { Step } from './step-label'

const step = (
  values: Partial<Step> & Pick<Step, 'id' | 'idx' | 'kind'>,
): Step => ({
  runId: 'run-1',
  roomId: 'general',
  text: '',
  createdAt: values.idx,
  ...values,
})

describe('run activity', () => {
  test('formats JSON step text for code blocks', () => {
    expect(
      formatStepText('{"text":"Message 1: starting task as requested."}'),
    ).toBe(
      `{
  "text": "Message 1: starting task as requested."
}`,
    )
    expect(formatStepText('plain text')).toBe('plain text')
  })

  test('merges persisted and live steps without duplicates', () => {
    const first = step({ id: 'first', idx: 0, kind: 'message' })
    const second = step({ id: 'second', idx: 1, kind: 'tool_call' })

    expect(mergeSteps([second], [first, second])).toEqual([first, second])
  })

  test('pairs tool results with their calls while preserving narration', () => {
    const narration = step({ id: 'narration', idx: 0, kind: 'message' })
    const call = step({
      id: 'call',
      idx: 1,
      kind: 'tool_call',
      callId: 'call-1',
    })
    const result = step({
      id: 'result',
      idx: 2,
      kind: 'tool_result',
      callId: 'call-1',
    })

    expect(pairSteps([narration, call, result])).toEqual([
      { step: narration },
      { step: call, result },
    ])
  })

  test('groups consecutive tool calls without grouping reasoning', () => {
    const firstReasoning = step({ id: 'reasoning-1', idx: 0, kind: 'message' })
    const firstTool = step({ id: 'tool-1', idx: 1, kind: 'tool_call' })
    const secondTool = step({ id: 'tool-2', idx: 2, kind: 'tool_call' })
    const secondReasoning = step({ id: 'reasoning-2', idx: 3, kind: 'message' })

    expect(
      groupActivity(
        pairSteps([firstReasoning, firstTool, secondTool, secondReasoning]),
      ),
    ).toEqual([
      { kind: 'reasoning', item: { step: firstReasoning } },
      { kind: 'tools', items: [{ step: firstTool }, { step: secondTool }] },
      { kind: 'reasoning', item: { step: secondReasoning } },
    ])
  })
})
