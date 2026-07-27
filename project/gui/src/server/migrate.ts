import { fileURLToPath } from 'node:url'
import { migrateDatabase, sqlite } from '#/lib/database'

await migrateDatabase(fileURLToPath(new URL('../../drizzle', import.meta.url)))
sqlite.close()
