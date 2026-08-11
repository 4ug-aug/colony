import { describe, expect, it } from 'vitest'
import { formatTimeSpentMinutes } from './format'

describe('formatTimeSpentMinutes', () => {
  it('formats under an hour as minutes', () => {
    expect(formatTimeSpentMinutes(1)).toBe('1m')
    expect(formatTimeSpentMinutes(45)).toBe('45m')
    expect(formatTimeSpentMinutes(59)).toBe('59m')
  })

  it('formats whole hours without trailing minutes', () => {
    expect(formatTimeSpentMinutes(60)).toBe('1h')
    expect(formatTimeSpentMinutes(120)).toBe('2h')
  })

  it('formats hours and minutes together', () => {
    expect(formatTimeSpentMinutes(90)).toBe('1h 30m')
    expect(formatTimeSpentMinutes(125)).toBe('2h 5m')
  })

  it('formats days when at least 24 hours', () => {
    expect(formatTimeSpentMinutes(1440)).toBe('1d')
    expect(formatTimeSpentMinutes(1500)).toBe('1d 1h')
    expect(formatTimeSpentMinutes(1501)).toBe('1d 1h 1m')
  })

  it('clamps non-positive values to 0m', () => {
    expect(formatTimeSpentMinutes(0)).toBe('0m')
    expect(formatTimeSpentMinutes(-5)).toBe('0m')
  })
})
