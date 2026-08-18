import { migratedDatabase, seedAccounts } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { clampNormalized, createSqliteBulletinStore } from './bulletin-store'


test('clampNormalized keeps values in unit interval', () => {
  expect(clampNormalized(-0.5)).toBe(0)
  expect(clampNormalized(1.5)).toBe(1)
  expect(clampNormalized(0.25)).toBe(0.25)
  expect(clampNormalized(Number.NaN)).toBe(0)
})

test('bulletin store creates, updates, moves, and deletes', () => {
  const sqlite = migratedDatabase()
  seedAccounts(sqlite, ['ada', 'grace'])
  const store = createSqliteBulletinStore(sqlite)

  const created = store.createBulletin({
    id: 'b1',
    body: 'Hello **world**',
    x: 0.5,
    y: 0.4,
    createdBy: 'ada',
    createdAt: 10,
  })
  expect(created).toMatchObject({
    id: 'b1',
    body: 'Hello **world**',
    x: 0.5,
    y: 0.4,
    createdBy: { id: 'ada', name: 'Ada' },
  })
  expect(store.listBulletins()).toHaveLength(1)

  const moved = store.updateBulletin('b1', { x: 1.5, y: -1 }, 20)
  expect(moved).toMatchObject({ x: 1, y: 0, updatedAt: 20 })

  const edited = store.updateBulletin('b1', { body: 'Updated' }, 30)
  expect(edited?.body).toBe('Updated')

  expect(store.deleteBulletin('b1')).toBe(true)
  expect(store.listBulletins()).toHaveLength(0)
  expect(store.getBulletin('b1')).toBeUndefined()
  sqlite.close()
})

test('bulletin poll records, replaces, and retracts votes', () => {
  const sqlite = migratedDatabase()
  seedAccounts(sqlite, ['ada', 'grace'])
  const store = createSqliteBulletinStore(sqlite)

  store.createBulletin({
    id: 'b1',
    body: 'Lunch?',
    x: 0.5,
    y: 0.5,
    createdBy: 'ada',
    createdAt: 10,
  })
  expect(store.getBulletin('b1')?.poll).toBeNull()
  // A bulletin without a poll cannot be voted on.
  expect(store.voteBulletin('b1', 'ada', [0], 15)).toBeUndefined()

  store.updateBulletin(
    'b1',
    { poll: { options: ['Pizza', 'Sushi', 'Tacos'], votes: {} } },
    20,
  )

  expect(store.voteBulletin('b1', 'ada', [0], 30)?.poll?.votes).toEqual({
    ada: [0],
  })
  expect(store.voteBulletin('b1', 'grace', [2], 40)?.poll?.votes).toEqual({
    ada: [0],
    grace: [2],
  })

  // Re-voting replaces rather than appends.
  expect(store.voteBulletin('b1', 'ada', [1], 50)?.poll?.votes).toEqual({
    ada: [1],
    grace: [2],
  })

  // Multi-choice keeps every index it is handed.
  expect(store.voteBulletin('b1', 'grace', [0, 1], 60)?.poll?.votes).toEqual({
    ada: [1],
    grace: [0, 1],
  })

  // Retracting removes the voter entirely, leaving the options untouched.
  const retracted = store.voteBulletin('b1', 'ada', null, 70)
  expect(retracted?.poll?.votes).toEqual({ grace: [0, 1] })
  expect(retracted?.poll?.options).toEqual(['Pizza', 'Sushi', 'Tacos'])
  expect(retracted?.updatedAt).toBe(70)

  // Editing the body leaves the poll alone; clearing the poll drops the votes.
  expect(
    store.updateBulletin('b1', { body: 'Dinner?' }, 80)?.poll?.votes,
  ).toEqual({ grace: [0, 1] })
  expect(store.updateBulletin('b1', { poll: null }, 90)?.poll).toBeNull()

  expect(store.voteBulletin('missing', 'ada', [0], 100)).toBeUndefined()
  sqlite.close()
})
