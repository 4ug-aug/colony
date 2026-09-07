import { describe, expect, test } from 'bun:test'
import { runActivityLabel } from './run-helpers'

describe('runActivityLabel', () => {
  test('maps run states to readable status labels', () => {
    expect(runActivityLabel('preparing')).toBe('Working…')
    expect(runActivityLabel('running')).toBe('Working…')
    expect(runActivityLabel('succeeded')).toBe('Completed')
    expect(runActivityLabel('failed')).toBe('Failed')
    expect(runActivityLabel('cancelled')).toBe('Cancelled')
  })
})
