import { describe, expect, test } from 'bun:test'
import {
  grillAwaitingWrapUpReview,
  grillIsComplete,
  grillListStatus,
  grillTurnActive,
} from './grill-status'
import type { GrillListItem } from './types'

function listItem(
  values: Partial<GrillListItem> & Pick<GrillListItem, 'id'>,
): GrillListItem {
  return {
    kind: 'general',
    visibility: 'invite-only',
    agentDefinitionId: 'agent-1',
    frontier: { questions: [], drafts: {} },
    settledAnswers: [],
    createdBy: 'user-1',
    createdAt: 0,
    updatedAt: 0,
    ...values,
  }
}

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

describe('grillTurnActive', () => {
  test('true when turnActive flag is set', () => {
    expect(
      grillTurnActive({
        linkedRun: {
          id: 'r1',
          task: 't',
          state: 'running',
          turnActive: true,
          agentId: 'a',
          provider: 'p',
          model: 'm',
          createdAt: 0,
        },
      }),
    ).toBe(true)
  })

  test('true when preparing', () => {
    expect(
      grillTurnActive({
        linkedRun: {
          id: 'r1',
          task: 't',
          state: 'preparing',
          agentId: 'a',
          provider: 'p',
          model: 'm',
          createdAt: 0,
        },
      }),
    ).toBe(true)
  })

  test('false when running without turnActive', () => {
    expect(
      grillTurnActive({
        linkedRun: {
          id: 'r1',
          task: 't',
          state: 'running',
          agentId: 'a',
          provider: 'p',
          model: 'm',
          createdAt: 0,
        },
      }),
    ).toBe(false)
  })
})

describe('grillListStatus', () => {
  test('your_turn when frontier has open questions', () => {
    expect(
      grillListStatus(
        listItem({
          id: 'g1',
          frontier: {
            questions: [{ id: 'q1', prompt: 'Why?' }],
            drafts: {},
          },
        }),
      ),
    ).toBe('your_turn')
  })

  test('your_turn when wrap-up review awaiting', () => {
    expect(
      grillListStatus(
        listItem({
          id: 'g1',
          writeup: { title: 'Doc', body: '# hi' },
        }),
      ),
    ).toBe('your_turn')
  })

  test('complete when Doc saved', () => {
    expect(
      grillListStatus(
        listItem({
          id: 'g1',
          docId: 'doc-1',
        }),
      ),
    ).toBe('complete')
  })

  test('in_progress when agent turn active', () => {
    expect(
      grillListStatus(
        listItem({
          id: 'g1',
          linkedRun: {
            id: 'r1',
            task: 't',
            state: 'running',
            turnActive: true,
            agentId: 'a',
            provider: 'p',
            model: 'm',
            createdAt: 0,
          },
        }),
      ),
    ).toBe('in_progress')
  })

  test('failed when linked run failed', () => {
    expect(
      grillListStatus(
        listItem({
          id: 'g1',
          linkedRun: {
            id: 'r1',
            task: 't',
            state: 'failed',
            error: 'boom',
            agentId: 'a',
            provider: 'p',
            model: 'm',
            createdAt: 0,
          },
        }),
      ),
    ).toBe('failed')
  })

  test('settled otherwise', () => {
    expect(grillListStatus(listItem({ id: 'g1' }))).toBe('settled')
  })

  test('complete takes precedence over failed linked run', () => {
    expect(
      grillListStatus(
        listItem({
          id: 'g1',
          docId: 'doc-1',
          linkedRun: {
            id: 'r1',
            task: 't',
            state: 'failed',
            agentId: 'a',
            provider: 'p',
            model: 'm',
            createdAt: 0,
          },
        }),
      ),
    ).toBe('complete')
  })
})
