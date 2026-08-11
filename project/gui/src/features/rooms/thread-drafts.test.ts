import { describe, expect, test } from 'bun:test'
import {
  emptyThreadDrafts,
  threadDraft,
  withThreadDraft,
  withoutThreadDraft,
} from './thread-drafts'

describe('threadDraft', () => {
  test('is empty for a root with no draft', () => {
    expect(threadDraft(emptyThreadDrafts, 'root-1')).toBe('')
  })
})

describe('withThreadDraft', () => {
  test('keeps one draft per root, leaving other roots untouched', () => {
    const drafts = withThreadDraft(
      withThreadDraft(emptyThreadDrafts, 'root-1', 'Hello'),
      'root-2',
      'Other thread',
    )
    expect(threadDraft(drafts, 'root-1')).toBe('Hello')
    expect(threadDraft(drafts, 'root-2')).toBe('Other thread')
    expect(threadDraft(drafts, 'root-3')).toBe('')
  })

  test('overwrites a root draft when switching back to it', () => {
    const drafts = withThreadDraft(
      withThreadDraft(emptyThreadDrafts, 'root-1', 'First'),
      'root-1',
      'Updated',
    )
    expect(threadDraft(drafts, 'root-1')).toBe('Updated')
  })
})

describe('withoutThreadDraft', () => {
  test('clears a root draft after successful submission', () => {
    const withDraft = withThreadDraft(emptyThreadDrafts, 'root-1', 'Sent text')
    const cleared = withoutThreadDraft(withDraft, 'root-1')
    expect(threadDraft(cleared, 'root-1')).toBe('')
  })

  test('leaves other root drafts untouched', () => {
    const drafts = withThreadDraft(
      withThreadDraft(emptyThreadDrafts, 'root-1', 'Keep me'),
      'root-2',
      'Clear me',
    )
    const cleared = withoutThreadDraft(drafts, 'root-2')
    expect(threadDraft(cleared, 'root-1')).toBe('Keep me')
    expect(threadDraft(cleared, 'root-2')).toBe('')
  })

  test('is a no-op when the root has no draft', () => {
    expect(withoutThreadDraft(emptyThreadDrafts, 'root-1')).toBe(
      emptyThreadDrafts,
    )
  })
})
