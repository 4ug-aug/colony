import { fileURLToPath } from 'node:url'
import { createAdmissionStore } from './admission'
import { migrateDatabase, sqlite } from '#/lib/database'

await migrateDatabase(fileURLToPath(new URL('../../drizzle', import.meta.url)))
const plaintext = createAdmissionStore(sqlite).rotateSetupToken()
process.stdout.write(`Sweat setup token: ${plaintext}\n`)
sqlite.close()
