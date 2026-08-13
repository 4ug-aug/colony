import type { Sqlite } from '#/server/sqlite'

export type DocActor = { id: string; name: string; image?: string }

export type Doc = {
  id: string
  title: string
  body: string
  createdBy: DocActor
  createdAt: number
  updatedAt: number
}

export type NewDoc = {
  id: string
  title: string
  body: string
  createdBy: string
  createdAt: number
}

export interface DocStore {
  listDocs(): Doc[]
  getDoc(id: string): Doc | undefined
  createDoc(doc: NewDoc): Doc
  updateDoc(
    id: string,
    patch: Partial<Pick<Doc, 'title' | 'body'>>,
    now: number,
  ): Doc | undefined
  deleteDoc(id: string): boolean
}

type DocRow = {
  id: string
  title: string
  body: string
  created_by: string
  created_name: string
  created_image: string | null
  created_at: number
  updated_at: number
}

const actor = (
  id: string,
  name: string,
  image: string | null,
): DocActor => ({
  id,
  name,
  ...(image ? { image } : {}),
})

const mapDoc = (row: DocRow): Doc => ({
  id: row.id,
  title: row.title,
  body: row.body,
  createdBy: actor(row.created_by, row.created_name, row.created_image),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const selectDocs = (sqlite: Sqlite, where = '', ...values: unknown[]) => {
  const rows = sqlite
    .prepare(
      `SELECT d.id, d.title, d.body, d.created_by, c.name AS created_name,
              c.image AS created_image, d.created_at, d.updated_at
       FROM doc d JOIN user c ON c.id = d.created_by ${where}
       ORDER BY d.updated_at ASC`,
    )
    .all(...values) as DocRow[]
  return rows.map(mapDoc)
}

export function createSqliteDocStore(sqlite: Sqlite): DocStore {
  return {
    listDocs: () => selectDocs(sqlite),
    getDoc: (id) => selectDocs(sqlite, 'WHERE d.id = ?', id)[0],
    createDoc: (doc) => {
      sqlite
        .prepare(
          `INSERT INTO doc (id, title, body, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(doc.id, doc.title, doc.body, doc.createdBy, doc.createdAt, doc.createdAt)
      const created = selectDocs(sqlite, 'WHERE d.id = ?', doc.id)[0]
      if (!created) throw new Error('Failed to create doc')
      return created
    },
    updateDoc: (id, patch, now) => {
      const current = selectDocs(sqlite, 'WHERE d.id = ?', id)[0]
      if (!current) return undefined
      const title = patch.title !== undefined ? patch.title : current.title
      const body = patch.body !== undefined ? patch.body : current.body
      sqlite
        .prepare(
          `UPDATE doc SET title = ?, body = ?, updated_at = ? WHERE id = ?`,
        )
        .run(title, body, now, id)
      return selectDocs(sqlite, 'WHERE d.id = ?', id)[0]
    },
    deleteDoc: (id) =>
      ((
        sqlite.prepare('DELETE FROM doc WHERE id = ?').run(id) as {
          changes?: number
        }
      ).changes ?? 0) > 0,
  }
}
