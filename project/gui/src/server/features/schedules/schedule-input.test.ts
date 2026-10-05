import { expect, test } from 'bun:test'
import { newScheduleInput } from './schedule-input'

const known = (id: string) => id === 'antboy'
const body = {
  name: ' Standup digest ',
  task: 'Summarise yesterday',
  agentDefinitionId: 'antboy',
  cronExpression: '0 9 * * 1-5',
  timezone: 'Europe/Copenhagen',
}

test('a new schedule is trimmed, checked, and given its first run', () => {
  const input = newScheduleInput(body, Date.UTC(2026, 9, 5, 12), known)
  expect(input).toMatchObject({ name: 'Standup digest', agentDefinitionId: 'antboy' })
  // Tuesday 09:00 in Copenhagen (CEST) is 07:00 UTC.
  expect(input.nextRunAt).toBe(Date.UTC(2026, 9, 6, 7))
})

test('a new schedule rejects what an agent could get wrong', () => {
  const error = (patch: Record<string, unknown>) => {
    try {
      newScheduleInput({ ...body, ...patch }, Date.now(), known)
    } catch (reason) {
      return (reason as Error).message
    }
  }
  expect(error({ name: '' })).toBe('Invalid schedule name or task')
  expect(error({ agentDefinitionId: 'ghost' })).toBe('Unknown agent definition')
  expect(error({ cronExpression: 'every morning' })).toBeString()
  expect(error({ timezone: 'Mars/Olympus' })).toBeString()
})
