import { beforeEach, describe, expect, test } from 'bun:test'
import {
  clearThreadDraft,
  resetThreadDrafts,
  setThreadDraft,
  threadDraft,
} from './thread-drafts'

beforeEach(() => {
  resetThreadDrafts()
})

describe('threadDraft', () => {
  test('is empty for a root with no draft', () => {
    expect(threadDraft('root-1')).toBe('')
  })
})

describe('setThreadDraft', () => {
  test('keeps one draft per root, leaving other roots untouched', () => {
    setThreadDraft('root-1', 'Hello')
    setThreadDraft('root-2', 'Other thread')
    expect(threadDraft('root-1')).toBe('Hello')
    expect(threadDraft('root-2')).toBe('Other thread')
    expect(threadDraft('root-3')).toBe('')
  })

  test('overwrites a root draft when switching back to it', () => {
    setThreadDraft('root-1', 'First')
    setThreadDraft('root-1', 'Updated')
    expect(threadDraft('root-1')).toBe('Updated')
  })
})

describe('clearThreadDraft', () => {
  test('clears a root draft after successful submission', () => {
    setThreadDraft('root-1', 'Sent text')
    clearThreadDraft('root-1')
    expect(threadDraft('root-1')).toBe('')
  })

  test('leaves other root drafts untouched', () => {
    setThreadDraft('root-1', 'Keep me')
    setThreadDraft('root-2', 'Clear me')
    clearThreadDraft('root-2')
    expect(threadDraft('root-1')).toBe('Keep me')
    expect(threadDraft('root-2')).toBe('')
  })

  test('is a no-op when the root has no draft', () => {
    clearThreadDraft('root-1')
    expect(threadDraft('root-1')).toBe('')
  })
})
