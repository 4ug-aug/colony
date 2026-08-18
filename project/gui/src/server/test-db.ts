import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { fileURLToPath } from 'node:url'

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
