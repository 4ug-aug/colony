import { fileURLToPath } from 'node:url'
import { createAdmissionStore } from './features/accounts/admission'
import { migrateDatabase, sqlite } from '#/lib/database'

await migrateDatabase(fileURLToPath(new URL('../../drizzle', import.meta.url)))
const plaintext = createAdmissionStore(sqlite).rotateSetupToken()
process.stdout.write(`Colony setup token: ${plaintext}\n`)
sqlite.close()
