import { expect, test } from 'bun:test'
import { clockTime, timestamp } from './format'

const samples = [
  0,
  -86400000,
  1700000000000,
  Date.UTC(2026, 2, 29, 1),
  Date.UTC(2026, 9, 25, 1),
]

test('message timestamps retain the locale date/time format', () => {
  const format = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    day: 'numeric',
    month: 'long',
  })
  for (const value of samples) {
    expect(timestamp(value)).toBe(format.format(value))
  }
  expect(() => timestamp(NaN)).toThrow(RangeError)
})

test('message clock times use hour and minute only', () => {
  const format = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  for (const value of samples) {
    expect(clockTime(value)).toBe(format.format(value))
  }
  expect(() => clockTime(NaN)).toThrow(RangeError)
})
