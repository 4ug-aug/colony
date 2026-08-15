import { expect, test } from 'bun:test'
import {
  childrenAreRunning,
  isWaitingToIntegrate,
  parentWorkLabel,
} from './issue-tree'
import type { Issue } from './types'

const issue = (overrides: Partial<Issue> & Pick<Issue, 'id'>): Issue => ({
  number: 1,
  title: 'Issue',
  description: '',
  deliverable: '',
  status: 'in_progress',
  priority: 'none',
  tags: [],
  timeSpent: [],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})

test('parentWorkLabel is Children running when a direct child has an active run', () => {
  const parent = issue({ id: 'parent', owner: { kind: 'agent', id: 'antboy' } })
  const child = issue({
    id: 'child',
    number: 2,
    parentId: 'parent',
    hasActiveRun: true,
  })
  expect(childrenAreRunning(parent, [parent, child])).toBe(true)
  expect(parentWorkLabel(parent, [parent, child])).toBe('Children running')
})

test('parentWorkLabel is Waiting to integrate when an idle agent-owned parent has unsettled children', () => {
  const parent = issue({ id: 'parent', owner: { kind: 'agent', id: 'antboy' } })
  const child = issue({
    id: 'child',
    number: 2,
    parentId: 'parent',
    status: 'in_progress',
  })
  expect(isWaitingToIntegrate(parent, [parent, child])).toBe(true)
  expect(parentWorkLabel(parent, [parent, child])).toBe('Waiting to integrate')
})

test('parentWorkLabel is empty when the parent is In review or a child is a grandchild', () => {
  const parent = issue({
    id: 'parent',
    status: 'in_review',
    owner: { kind: 'agent', id: 'antboy' },
  })
  const child = issue({ id: 'child', number: 2, parentId: 'parent' })
  const grandchild = issue({
    id: 'grandchild',
    number: 3,
    parentId: 'child',
    hasActiveRun: true,
  })
  expect(parentWorkLabel(parent, [parent, child])).toBeUndefined()
  expect(parentWorkLabel(parent, [parent, child, grandchild])).toBeUndefined()
})
