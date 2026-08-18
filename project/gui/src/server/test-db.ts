import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { fileURLToPath } from 'node:url'
import type { RoomUser } from '#/server/features/rooms/room-store'

/**
 * In-memory database carrying the app's real schema. Tests that hand-write
 * CREATE TABLE drift from the migrations and pass against a schema production
 * never has; this applies the same migrations the server applies at boot.
 */
export function migratedDatabase(): Database {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  migrate(drizzle(sqlite) as never, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
  return sqlite
}

/**
 * Accounts in the real `user` table, which requires more than an id. Pass
 * `'ada'` for an account named Ada, or an object to control the other columns.
 */
export function seedAccounts(
  sqlite: Database,
  accounts: readonly (string | RoomUser)[],
): void {
  const insert = sqlite.prepare(
    'INSERT OR REPLACE INTO user (id, name, email, image, username) VALUES (?, ?, ?, ?, ?)',
  )
  for (const entry of accounts) {
    const account: RoomUser =
      typeof entry === 'string'
        ? { id: entry, name: entry[0].toUpperCase() + entry.slice(1) }
        : entry
    insert.run(
      account.id,
      account.name,
      account.email ?? `${account.id}@example.com`,
      account.image ?? null,
      account.username ?? null,
    )
  }
}
