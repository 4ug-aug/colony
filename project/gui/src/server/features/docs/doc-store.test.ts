import { migratedDatabase } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { createSqliteDocStore } from './doc-store'


test('create makes doc retrievable via get and list', () => {
  const sqlite = migratedDatabase()
  sqlite.exec(`
    INSERT INTO user (id, name, email) VALUES ('ada', 'Ada', 'ada@example.com');
  `)
  const store = createSqliteDocStore(sqlite)

  const created = store.createDoc({
    id: 'd1',
    title: 'Design language',
    body: 'Hello **world**',
    createdBy: 'ada',
    createdAt: 10,
  })
  expect(created).toMatchObject({
    id: 'd1',
    title: 'Design language',
    body: 'Hello **world**',
    createdBy: { id: 'ada', name: 'Ada' },
    createdAt: 10,
    updatedAt: 10,
  })
  expect(store.getDoc('d1')).toEqual(created)
  expect(store.listDocs()).toEqual([created])
  sqlite.close()
})

test('update body/title changes updatedAt', () => {
  const sqlite = migratedDatabase()
  sqlite.exec(`
    INSERT INTO user (id, name, email) VALUES ('ada', 'Ada', 'ada@example.com');
  `)
  const store = createSqliteDocStore(sqlite)

  store.createDoc({
    id: 'd1',
    title: 'Draft',
    body: 'v1',
    createdBy: 'ada',
    createdAt: 10,
  })

  const updated = store.updateDoc('d1', { title: 'Final', body: 'v2' }, 20)
  expect(updated).toMatchObject({
    title: 'Final',
    body: 'v2',
    updatedAt: 20,
    createdAt: 10,
  })
  expect(store.updateDoc('missing', { body: 'x' }, 30)).toBeUndefined()
  sqlite.close()
})

test('deleteDoc removes the Doc', () => {
  const sqlite = migratedDatabase()
  sqlite.exec(`
    INSERT INTO user (id, name, email) VALUES ('ada', 'Ada', 'ada@example.com');
  `)
  const store = createSqliteDocStore(sqlite)

  store.createDoc({
    id: 'd1',
    title: 'Draft',
    body: 'v1',
    createdBy: 'ada',
    createdAt: 10,
  })
  expect(store.deleteDoc('d1')).toBe(true)
  expect(store.getDoc('d1')).toBeUndefined()
  expect(store.listDocs()).toEqual([])
  expect(store.deleteDoc('d1')).toBe(false)
  sqlite.close()
})
