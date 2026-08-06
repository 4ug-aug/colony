import { describe, expect, test } from 'bun:test'
import {
  EMPTY_ISSUE_FILTERS,
  filterIssues,
  issueFiltersActive,
  parseStoredIssueFilters,
  serializeIssueFilters,
  type IssueListFilters,
} from './issue-filters'
import type { Issue } from './types'

const issue = (values: Partial<Issue> & Pick<Issue, 'id' | 'number'>): Issue => ({
  title: `Issue ${values.number}`,
  description: '',
  deliverable: '',
  status: 'todo',
  priority: 'none',
  tags: [],
  timeSpent: [],
  createdAt: 0,
  updatedAt: 0,
  ...values,
})

const base: Issue[] = [
  issue({
    id: 'a',
    number: 1,
    status: 'todo',
    priority: 'high',
    tags: ['api', 'bug'],
    owner: { kind: 'account', id: 'me' },
  }),
  issue({
    id: 'b',
    number: 2,
    status: 'in_progress',
    priority: 'low',
    tags: ['api'],
    owner: { kind: 'account', id: 'other' },
  }),
  issue({
    id: 'c',
    number: 3,
    status: 'done',
    priority: 'high',
    tags: ['docs'],
    owner: { kind: 'agent', id: 'agent-1' },
  }),
  issue({
    id: 'd',
    number: 4,
    status: 'backlog',
    priority: 'urgent',
    tags: ['api', 'bug'],
  }),
]

function ids(issues: Issue[]): string[] {
  return issues.map((item) => item.id)
}

describe('filterIssues', () => {
  test('returns all issues when filters are empty', () => {
    expect(ids(filterIssues(base, EMPTY_ISSUE_FILTERS))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  test('filters assigned to me', () => {
    const filters: IssueListFilters = {
      ...EMPTY_ISSUE_FILTERS,
      assignedToMe: true,
      accountId: 'me',
    }
    expect(ids(filterIssues(base, filters))).toEqual(['a'])
  })

  test('assigned to me with no accountId matches nothing', () => {
    const filters: IssueListFilters = {
      ...EMPTY_ISSUE_FILTERS,
      assignedToMe: true,
    }
    expect(ids(filterIssues(base, filters))).toEqual([])
  })

  test('filters by priority (any of selected)', () => {
    const filters: IssueListFilters = {
      ...EMPTY_ISSUE_FILTERS,
      priorities: ['high', 'urgent'],
    }
    expect(ids(filterIssues(base, filters))).toEqual(['a', 'c', 'd'])
  })

  test('filters by tags requiring all selected', () => {
    const filters: IssueListFilters = {
      ...EMPTY_ISSUE_FILTERS,
      tags: ['api', 'bug'],
    }
    expect(ids(filterIssues(base, filters))).toEqual(['a', 'd'])
  })

  test('filters by status', () => {
    const filters: IssueListFilters = {
      ...EMPTY_ISSUE_FILTERS,
      statuses: ['todo', 'done'],
    }
    expect(ids(filterIssues(base, filters))).toEqual(['a', 'c'])
  })

  test('ANDs all active dimensions', () => {
    const filters: IssueListFilters = {
      assignedToMe: true,
      accountId: 'me',
      priorities: ['high'],
      tags: ['api'],
      statuses: ['todo'],
    }
    expect(ids(filterIssues(base, filters))).toEqual(['a'])
  })
})

describe('issueFiltersActive', () => {
  test('is false for empty filters', () => {
    expect(issueFiltersActive(EMPTY_ISSUE_FILTERS)).toBe(false)
  })

  test('is true when any dimension is set', () => {
    expect(
      issueFiltersActive({ ...EMPTY_ISSUE_FILTERS, assignedToMe: true }),
    ).toBe(true)
    expect(
      issueFiltersActive({ ...EMPTY_ISSUE_FILTERS, priorities: ['low'] }),
    ).toBe(true)
    expect(issueFiltersActive({ ...EMPTY_ISSUE_FILTERS, tags: ['api'] })).toBe(
      true,
    )
    expect(
      issueFiltersActive({ ...EMPTY_ISSUE_FILTERS, statuses: ['done'] }),
    ).toBe(true)
  })
})

describe('parseStoredIssueFilters', () => {
  test('returns empty filters for null or invalid JSON', () => {
    expect(parseStoredIssueFilters(null)).toEqual(EMPTY_ISSUE_FILTERS)
    expect(parseStoredIssueFilters('not-json')).toEqual(EMPTY_ISSUE_FILTERS)
    expect(parseStoredIssueFilters('[]')).toEqual(EMPTY_ISSUE_FILTERS)
  })

  test('round-trips valid filters without accountId', () => {
    const filters: IssueListFilters = {
      assignedToMe: true,
      accountId: 'should-not-persist',
      priorities: ['high', 'urgent'],
      tags: ['api', 'bug'],
      statuses: ['todo', 'done'],
    }
    const stored = serializeIssueFilters(filters)
    expect(JSON.parse(stored)).toEqual({
      assignedToMe: true,
      priorities: ['high', 'urgent'],
      tags: ['api', 'bug'],
      statuses: ['todo', 'done'],
    })
    expect(parseStoredIssueFilters(stored)).toEqual({
      assignedToMe: true,
      priorities: ['high', 'urgent'],
      tags: ['api', 'bug'],
      statuses: ['todo', 'done'],
    })
  })

  test('drops invalid enum values and non-string tags', () => {
    const raw = JSON.stringify({
      assignedToMe: true,
      priorities: ['high', 'nope'],
      tags: ['ok', 12, ''],
      statuses: ['todo', 'missing'],
    })
    expect(parseStoredIssueFilters(raw)).toEqual({
      assignedToMe: true,
      priorities: ['high'],
      tags: ['ok'],
      statuses: ['todo'],
    })
  })
})
