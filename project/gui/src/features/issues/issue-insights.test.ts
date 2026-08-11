import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { IssuePriorityIcon, IssueStatusIcon } from './issue-icons'
import { buildIssueInsights } from './issue-insights'
import type { Issue } from './types'

const issue = (
  status: Issue['status'],
  priority: Issue['priority'],
): Issue => ({
  id: `${status}-${priority}`,
  number: 1,
  title: 'Issue',
  description: '',
  deliverable: '',
  status,
  priority,
  tags: [],
  timeSpent: [],
  createdAt: 0,
  updatedAt: 0,
})

test('builds status totals segmented by priority', () => {
  expect(
    buildIssueInsights([
      issue('todo', 'high'),
      issue('todo', 'low'),
      issue('done', 'high'),
    ]),
  ).toEqual([
    {
      status: 'backlog',
      total: 0,
      priorities: { none: 0, low: 0, medium: 0, high: 0, urgent: 0 },
    },
    {
      status: 'todo',
      total: 2,
      priorities: { none: 0, low: 1, medium: 0, high: 1, urgent: 0 },
    },
    {
      status: 'in_progress',
      total: 0,
      priorities: { none: 0, low: 0, medium: 0, high: 0, urgent: 0 },
    },
    {
      status: 'in_review',
      total: 0,
      priorities: { none: 0, low: 0, medium: 0, high: 0, urgent: 0 },
    },
    {
      status: 'done',
      total: 1,
      priorities: { none: 0, low: 0, medium: 0, high: 1, urgent: 0 },
    },
  ])
})

test('uses Circle priority glyph geometry', () => {
  const low = renderToStaticMarkup(
    createElement(IssuePriorityIcon, { priority: 'low' }),
  )
  const urgent = renderToStaticMarkup(
    createElement(IssuePriorityIcon, { priority: 'urgent' }),
  )

  expect(low.match(/fill-opacity="0.4"/g)).toHaveLength(2)
  expect(low).toContain('x="11.5" y="2" width="3" height="12" rx="1"')
  expect(urgent).toContain('M3 1C1.91067 1 1 1.91067 1 3V13')
})

test('status icons have explicit compact dimensions', () => {
  const status = renderToStaticMarkup(
    createElement(IssueStatusIcon, { status: 'backlog' }),
  )

  expect(status).toContain('width="14"')
  expect(status).toContain('height="14"')
})
