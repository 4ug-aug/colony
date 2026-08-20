import { describe, expect, it } from 'bun:test'
import { ownerValue, parseOwnerValue } from './owner-encoding'

describe('ownerValue', () => {
  it('encodes missing owner as none', () => {
    expect(ownerValue(undefined)).toBe('none')
  })

  it('encodes account and agent owners', () => {
    expect(ownerValue({ kind: 'account', id: 'ada' })).toBe('account:ada')
    expect(ownerValue({ kind: 'agent', id: 'antboy' })).toBe('agent:antboy')
  })
})

describe('parseOwnerValue', () => {
  it('treats none, empty, and null as unassigned', () => {
    expect(parseOwnerValue('none')).toBeNull()
    expect(parseOwnerValue('')).toBeNull()
    expect(parseOwnerValue(null)).toBeNull()
  })

  it('parses account and agent values', () => {
    expect(parseOwnerValue('account:ada')).toEqual({
      kind: 'account',
      id: 'ada',
    })
    expect(parseOwnerValue('agent:antboy')).toEqual({
      kind: 'agent',
      id: 'antboy',
    })
  })

  it('rejects malformed values', () => {
    expect(parseOwnerValue('account')).toBeNull()
    expect(parseOwnerValue(':ada')).toBeNull()
    expect(parseOwnerValue('account:')).toBeNull()
    expect(parseOwnerValue('team:ada')).toBeNull()
  })
})
