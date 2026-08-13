import { describe, expect, it } from 'bun:test'
import { formatIssueMarkdown, formatTimeSpentMinutes } from './format'
import type { Issue } from './types'

const issue = (values: Partial<Issue> = {}): Issue => ({
  id: 'issue-1',
  number: 5,
  title: 'Test child 2',
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

describe('formatIssueMarkdown', () => {
  it('includes properties, description, and deliverable', () => {
    expect(
      formatIssueMarkdown(
        issue({
          status: 'in_progress',
          priority: 'high',
          tags: ['api', 'bug'],
          timeSpent: [45, 30],
          effectiveBranch: 'feat/badge',
          description: 'Ship the badge.',
          deliverable: 'Badge shipped.',
          owner: { kind: 'account', id: 'user-1' },
        }),
        { assignee: 'August' },
      ),
    ).toBe(
      [
        '# COL-5 Test child 2',
        '',
        '- Status: In Progress',
        '- Priority: High',
        '- Assignee: August',
        '- Branch: feat/badge',
        '- Tags: api, bug',
        '- Time spent: 1h 15m',
        '',
        '## Description',
        '',
        'Ship the badge.',
        '',
        '## Deliverable',
        '',
        'Badge shipped.',
      ].join('\n'),
    )
  })

  it('uses placeholders when optional fields are empty', () => {
    expect(formatIssueMarkdown(issue())).toBe(
      [
        '# COL-5 Test child 2',
        '',
        '- Status: Todo',
        '- Priority: No priority',
        '- Assignee: —',
        '- Branch: —',
        '- Tags: —',
        '- Time spent: —',
      ].join('\n'),
    )
  })
})

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
