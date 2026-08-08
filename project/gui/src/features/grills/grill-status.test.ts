import { describe, expect, test } from 'bun:test'
import {
  grillAwaitingWrapUpReview,
  grillIsComplete,
} from './grill-status'

describe('grillAwaitingWrapUpReview', () => {
  test('true when writeup awaits Doc save', () => {
    expect(
      grillAwaitingWrapUpReview({
        writeup: { title: 'Doc', body: '# hi' },
      }),
    ).toBe(true)
  })

  test('false when Doc already saved', () => {
    expect(
      grillAwaitingWrapUpReview({
        writeup: { title: 'Doc', body: '# hi' },
        docId: 'doc-1',
      }),
    ).toBe(false)
  })

  test('true when issue proposal is proposed', () => {
    expect(
      grillAwaitingWrapUpReview({
        issueProposal: { status: 'proposed', issues: [] },
      }),
    ).toBe(true)
  })

  test('false when revision requested (agent turn)', () => {
    expect(
      grillAwaitingWrapUpReview({
        issueProposal: {
          status: 'revision_requested',
          issues: [],
          revisionNotes: 'more detail',
        },
      }),
    ).toBe(false)
  })
})

describe('grillIsComplete', () => {
  test('true when Doc persisted', () => {
    expect(grillIsComplete({ docId: 'doc-1' })).toBe(true)
  })

  test('true when session branch materialized', () => {
    expect(grillIsComplete({ sessionBranch: 'sweat/grill/g-1' })).toBe(true)
  })

  test('true when issues confirmed', () => {
    expect(
      grillIsComplete({
        issueProposal: { status: 'confirmed', issues: [] },
      }),
    ).toBe(true)
  })

  test('false while still proposed', () => {
    expect(
      grillIsComplete({
        issueProposal: { status: 'proposed', issues: [] },
      }),
    ).toBe(false)
  })
})
