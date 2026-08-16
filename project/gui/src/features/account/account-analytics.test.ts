import { expect, test } from 'bun:test'
import type { Issue } from '#/features/issues/types'
import { buildAccountAnalytics, countUpValue } from './account-analytics'

const DAY = 86_400_000
const issue = (patch: Partial<Issue>): Issue => ({
  id: crypto.randomUUID(),
  number: 1,
  title: 'Issue',
  description: '',
  deliverable: '',
  status: 'todo',
  priority: 'none',
  tags: [],
  timeSpent: [],
  createdAt: 8 * DAY,
  updatedAt: 8 * DAY,
  ...patch,
})

test('countUpValue eases between exact endpoints', () => {
  expect(countUpValue(0, 100, 0)).toBe(0)
  expect(countUpValue(0, 100, 0.5)).toBe(88)
  expect(countUpValue(0, 100, 1)).toBe(100)
})

test('buildAccountAnalytics scopes metrics and rhythm to the account', () => {
  const analytics = buildAccountAnalytics(
    [
      issue({
        owner: { kind: 'account', id: 'me' },
        createdBy: { kind: 'account', id: 'me' },
        status: 'done',
      }),
      issue({
        owner: { kind: 'account', id: 'me' },
        createdAt: 9 * DAY,
        updatedAt: 10 * DAY,
        status: 'in_review',
      }),
      issue({ createdBy: { kind: 'account', id: 'me' } }),
      issue({ owner: { kind: 'account', id: 'someone-else' } }),
    ],
    'me',
    10 * DAY,
  )

  expect(analytics).toMatchObject({
    assigned: 2,
    opened: 2,
    active: 1,
    completed: 1,
  })
  expect(analytics.rhythm.at(-1)).toMatchObject({ opened: 0, touched: 1 })
})
