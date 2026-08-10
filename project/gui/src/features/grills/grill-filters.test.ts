import { describe, expect, test } from 'bun:test'
import {
  EMPTY_GRILL_FILTERS,
  grillDisplayTitle,
  grillFiltersActive,
  toGrillListSearchParams,
} from './grill-filters'
import type { GrillListItem } from './types'

function grill(
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

describe('grillDisplayTitle', () => {
  test('uses initialRequest when present', () => {
    expect(
      grillDisplayTitle(
        grill({ id: 'a', initialRequest: 'Fix the auth bug' }),
      ),
    ).toBe('Fix the auth bug')
  })

  test('falls back to kind title', () => {
    expect(grillDisplayTitle(grill({ id: 'c', kind: 'code' }))).toBe(
      'Code Grill',
    )
    expect(grillDisplayTitle(grill({ id: 'd', kind: 'general' }))).toBe(
      'General Grill',
    )
  })
})

describe('grillFiltersActive', () => {
  test('is false for empty filters and search', () => {
    expect(grillFiltersActive(EMPTY_GRILL_FILTERS)).toBe(false)
    expect(grillFiltersActive(EMPTY_GRILL_FILTERS, '  ')).toBe(false)
  })

  test('is true when any dimension or search is set', () => {
    expect(grillFiltersActive(EMPTY_GRILL_FILTERS, 'auth')).toBe(true)
    expect(
      grillFiltersActive({ ...EMPTY_GRILL_FILTERS, statuses: ['settled'] }),
    ).toBe(true)
    expect(
      grillFiltersActive({ ...EMPTY_GRILL_FILTERS, kinds: ['code'] }),
    ).toBe(true)
    expect(
      grillFiltersActive({
        ...EMPTY_GRILL_FILTERS,
        visibilities: ['invite-only'],
      }),
    ).toBe(true)
  })
})

describe('toGrillListSearchParams', () => {
  test('encodes page query and active filters', () => {
    const params = toGrillListSearchParams({
      page: 2,
      pageSize: 10,
      search: ' auth ',
      filters: {
        statuses: ['your_turn', 'complete'],
        kinds: ['code'],
        visibilities: ['workspace-open'],
      },
    })
    expect(params.get('page')).toBe('2')
    expect(params.get('pageSize')).toBe('10')
    expect(params.get('search')).toBe('auth')
    expect(params.get('statuses')).toBe('your_turn,complete')
    expect(params.get('kinds')).toBe('code')
    expect(params.get('visibilities')).toBe('workspace-open')
  })

  test('omits empty filter dimensions', () => {
    const params = toGrillListSearchParams({
      page: 1,
      pageSize: 10,
      search: '',
      filters: EMPTY_GRILL_FILTERS,
    })
    expect([...params.keys()].sort()).toEqual(['page', 'pageSize'])
  })
})
