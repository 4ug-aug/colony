import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { clampNormalized, createSqliteBulletinStore } from './bulletin-store'

const schema = `
  CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, image TEXT);
  INSERT INTO user VALUES ('ada', 'Ada', NULL);
  CREATE TABLE bulletin (
    id TEXT PRIMARY KEY NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    x REAL NOT NULL CHECK (x >= 0 AND x <= 1),
    y REAL NOT NULL CHECK (y >= 0 AND y <= 1),
    created_by TEXT NOT NULL REFERENCES user(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`

test('clampNormalized keeps values in unit interval', () => {
  expect(clampNormalized(-0.5)).toBe(0)
  expect(clampNormalized(1.5)).toBe(1)
  expect(clampNormalized(0.25)).toBe(0.25)
  expect(clampNormalized(Number.NaN)).toBe(0)
})

test('bulletin store creates, updates, moves, and deletes', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(schema)
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
