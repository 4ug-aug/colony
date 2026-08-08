import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createSqliteDocStore } from './doc-store'

const schema = `
  CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, image TEXT);
  INSERT INTO user VALUES ('ada', 'Ada', NULL);
  CREATE TABLE doc (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL REFERENCES user(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`

test('create makes doc retrievable via get and list', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(schema)
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
  const sqlite = new Database(':memory:')
  sqlite.exec(schema)
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
