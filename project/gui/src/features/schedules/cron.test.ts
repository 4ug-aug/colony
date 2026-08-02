import { expect, test } from 'bun:test'
import { previewCron } from './cron'

test('previews a five-field Copenhagen Friday schedule', () => {
  const from = Date.parse('2026-08-01T00:00:00.000Z')
  const result = previewCron('0 9 * * 5', 'Europe/Copenhagen', from)
  expect(result.description).toContain('Friday')
  expect(result.nextRuns).toEqual([
    Date.parse('2026-08-07T07:00:00.000Z'),
    Date.parse('2026-08-14T07:00:00.000Z'),
    Date.parse('2026-08-21T07:00:00.000Z'),
  ])
  expect(previewCron('0 9 * * 5', 'Europe/Copenhagen', from)).toEqual(result)
})

test('rejects invalid syntax and timezone', () => {
  expect(() => previewCron('@daily', 'Europe/Copenhagen')).toThrow()
  expect(() => previewCron('0 9 * * 5', 'Not/AZone')).toThrow()
})
