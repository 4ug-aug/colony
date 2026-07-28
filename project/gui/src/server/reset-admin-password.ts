import { fileURLToPath } from 'node:url'
import { migrateDatabase, sqlite } from '#/lib/database'
import { auth } from '#/lib/auth'

await migrateDatabase(fileURLToPath(new URL('../../drizzle', import.meta.url)))
const password = process.argv[2]
if (!password) throw new Error('Usage: bun run src/server/reset-admin-password.ts <password>')
if (password.length < 8) throw new Error('Password must be at least 8 characters')
const context = await auth.$context
const admins = await context.internalAdapter.listUsers(1, 0, undefined, [
  { field: 'role', value: 'admin' },
])
if (admins.length === 0) throw new Error('No workspace administrator exists')
const admin = admins[0]
await context.internalAdapter.updatePassword(admin.id, password)
await context.internalAdapter.deleteUserSessions(admin.id)
process.stdout.write(`Reset administrator password for ${admin.email}\n`)
sqlite.close()
