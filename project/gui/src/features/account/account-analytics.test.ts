import { expect, test } from 'bun:test'
import { countUpValue, formatRuntime } from './account-analytics'

test('countUpValue eases between exact endpoints', () => {
  expect(countUpValue(0, 100, 0)).toBe(0)
  expect(countUpValue(0, 100, 0.5)).toBe(88)
  expect(countUpValue(0, 100, 1)).toBe(100)
})

test('formatRuntime uses compact minute and hour labels', () => {
  expect(formatRuntime(0)).toBe('0m')
  expect(formatRuntime(42 * 60_000)).toBe('42m')
  expect(formatRuntime((12 * 60 + 34) * 60_000)).toBe('12h 34m')
})
