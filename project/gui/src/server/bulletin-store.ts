type Sqlite = { prepare(sql: string): Statement }
type Statement = {
  all(...values: unknown[]): unknown[]
  get(...values: unknown[]): unknown
  run(...values: unknown[]): unknown
}

export type BulletinActor = { id: string; name: string; image?: string }

// ponytail: options are identified by array index, so reordering or removing an
// option while votes exist shifts them. Give options stable ids if that bites.
export type Poll = {
  multi?: boolean
  options: string[]
  votes: Record<string, number[]>
}

export type Bulletin = {
  id: string
  body: string
  x: number
  y: number
  poll: Poll | null
  createdBy: BulletinActor
  createdAt: number
  updatedAt: number
}

export type NewBulletin = {
  id: string
  body: string
  x: number
  y: number
  createdBy: string
  createdAt: number
}

export interface BulletinStore {
  listBulletins(): Bulletin[]
  getBulletin(id: string): Bulletin | undefined
  createBulletin(bulletin: NewBulletin): Bulletin
  updateBulletin(
    id: string,
    patch: Partial<Pick<Bulletin, 'body' | 'x' | 'y' | 'poll'>>,
    now: number,
  ): Bulletin | undefined
  voteBulletin(
    id: string,
    userId: string,
    options: number[] | null,
    now: number,
  ): Bulletin | undefined
  deleteBulletin(id: string): boolean
}

type BulletinRow = {
  id: string
  body: string
  x: number
  y: number
  poll: string | null
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
): BulletinActor => ({
  id,
  name,
  ...(image ? { image } : {}),
})

const parsePoll = (raw: string | null): Poll | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<Poll>
    if (!Array.isArray(parsed.options)) return null
    return {
      ...(parsed.multi ? { multi: true } : {}),
      options: parsed.options,
      votes: parsed.votes ?? {},
    }
  } catch {
    return null
  }
}

const mapBulletin = (row: BulletinRow): Bulletin => ({
  id: row.id,
  body: row.body,
  x: row.x,
  y: row.y,
  poll: parsePoll(row.poll),
  createdBy: actor(row.created_by, row.created_name, row.created_image),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const selectBulletins = (sqlite: Sqlite, where = '', ...values: unknown[]) => {
  const rows = sqlite
    .prepare(
      `SELECT b.id, b.body, b.x, b.y, b.poll, b.created_by, c.name AS created_name,
              c.image AS created_image, b.created_at, b.updated_at
       FROM bulletin b JOIN user c ON c.id = b.created_by ${where}
       ORDER BY b.updated_at ASC`,
    )
    .all(...values) as BulletinRow[]
  return rows.map(mapBulletin)
}

export function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function createSqliteBulletinStore(sqlite: Sqlite): BulletinStore {
  return {
    listBulletins: () => selectBulletins(sqlite),
    getBulletin: (id) => selectBulletins(sqlite, 'WHERE b.id = ?', id)[0],
    createBulletin: (bulletin) => {
      sqlite
        .prepare(
          `INSERT INTO bulletin (id, body, x, y, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          bulletin.id,
          bulletin.body,
          clampNormalized(bulletin.x),
          clampNormalized(bulletin.y),
          bulletin.createdBy,
          bulletin.createdAt,
          bulletin.createdAt,
        )
      const created = selectBulletins(sqlite, 'WHERE b.id = ?', bulletin.id)[0]
      if (!created) throw new Error('Failed to create bulletin')
      return created
    },
    updateBulletin: (id, patch, now) => {
      const current = selectBulletins(sqlite, 'WHERE b.id = ?', id)[0]
      if (!current) return undefined
      const body = patch.body !== undefined ? patch.body : current.body
      const x = patch.x !== undefined ? clampNormalized(patch.x) : current.x
      const y = patch.y !== undefined ? clampNormalized(patch.y) : current.y
      const poll = patch.poll !== undefined ? patch.poll : current.poll
      sqlite
        .prepare(
          `UPDATE bulletin SET body = ?, x = ?, y = ?, poll = ?, updated_at = ? WHERE id = ?`,
        )
        .run(body, x, y, poll ? JSON.stringify(poll) : null, now, id)
      return selectBulletins(sqlite, 'WHERE b.id = ?', id)[0]
    },
    // One statement so concurrent voters can't clobber each other's choice.
    voteBulletin: (id, userId, options, now) => {
      const choice = options === null ? null : JSON.stringify(options)
      const result = sqlite
        .prepare(
          `UPDATE bulletin
           SET poll = CASE WHEN ? IS NULL
                 THEN json_remove(poll, '$.votes.' || json_quote(?))
                 ELSE json_set(poll, '$.votes.' || json_quote(?), json(?)) END,
               updated_at = ?
           WHERE id = ? AND poll IS NOT NULL`,
        )
        .run(choice, userId, userId, choice, now, id) as { changes?: number }
      if ((result.changes ?? 0) === 0) return undefined
      return selectBulletins(sqlite, 'WHERE b.id = ?', id)[0]
    },
    deleteBulletin: (id) =>
      ((
        sqlite.prepare('DELETE FROM bulletin WHERE id = ?').run(id) as {
          changes?: number
        }
      ).changes ?? 0) > 0,
  }
}
