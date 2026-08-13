/* eslint-disable @typescript-eslint/method-signature-style -- accepts Bun and better-sqlite3 statements */
export type SqliteStatement = {
  all(...values: unknown[]): unknown[]
  get(...values: unknown[]): unknown
  run(...values: unknown[]): { changes?: number }
}

export type Sqlite = { prepare(sql: string): SqliteStatement }
