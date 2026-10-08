import { migratedDatabase } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { createWatchedPullRequestStore } from './watched-pull-request-store'

test('watched pull requests are recorded, taken over, advanced and removed', () => {
  const store = createWatchedPullRequestStore(migratedDatabase())
  const base = { repository: 'acme/widgets', number: 7 }
  store.record({
    ...base,
    agentDefinitionId: 'software-engineer',
    responsibleAccountId: 'ada',
    issueId: 'issue-1',
    now: 1000,
  })
  expect(store.list()).toEqual([
    {
      ...base,
      agentDefinitionId: 'software-engineer',
      responsibleAccountId: 'ada',
      issueId: 'issue-1',
      cursor: new Date(1000).toISOString(),
      createdAt: 1000,
      updatedAt: 1000,
    },
  ])

  store.advance(base.repository, 7, { cursor: 'c2', checkedSha: 'abc' }, 2000)
  store.record({
    ...base,
    agentDefinitionId: 'antboy',
    responsibleAccountId: 'grace',
    now: 3000,
  })
  expect(store.get(base.repository, 7)).toEqual({
    ...base,
    agentDefinitionId: 'antboy',
    responsibleAccountId: 'grace',
    cursor: 'c2',
    checkedSha: 'abc',
    createdAt: 1000,
    updatedAt: 3000,
  })

  store.advance(base.repository, 7, { checkedSha: 'def' }, 4000)
  expect(store.get(base.repository, 7)).toMatchObject({
    cursor: 'c2',
    checkedSha: 'def',
  })

  store.remove(base.repository, 7)
  expect(store.list()).toEqual([])
})
