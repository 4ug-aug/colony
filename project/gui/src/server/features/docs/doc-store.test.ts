import { migratedDatabase, seedAccounts } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { createSqliteDocStore } from './doc-store'

// CRUD through the real store is covered end to end by docs-http.test.ts. What
// only the store can show is timestamp handling and the missing-row returns.
test('a Doc keeps its createdAt across updates, and missing ids report absence', () => {
  const sqlite = migratedDatabase()
  seedAccounts(sqlite, ['ada'])
  const store = createSqliteDocStore(sqlite)
  store.createDoc({
    id: 'd1',
    title: 'Draft',
    body: 'v1',
    createdBy: 'ada',
    createdAt: 10,
  })

  expect(store.updateDoc('d1', { title: 'Final', body: 'v2' }, 20)).toMatchObject(
    { title: 'Final', body: 'v2', createdAt: 10, updatedAt: 20 },
  )
  expect(store.updateDoc('missing', { body: 'x' }, 30)).toBeUndefined()
  expect(store.deleteDoc('d1')).toBe(true)
  expect(store.deleteDoc('d1')).toBe(false)
  sqlite.close()
})
