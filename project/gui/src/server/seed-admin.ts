import { eq } from 'drizzle-orm'
import { auth } from '#/lib/auth'
import { user } from '#/lib/auth-schema'
import { db, sqlite } from '#/lib/database'

const users = [
  {
    email: process.env.SWEAT_ADMIN_EMAIL ?? 'admin@sweat.local',
    password: process.env.SWEAT_ADMIN_PASSWORD ?? 'change-me-now',
    name: process.env.SWEAT_ADMIN_NAME ?? 'Admin',
  },
  {
    email: process.env.SWEAT_MEMBER_EMAIL ?? 'teammate@sweat.local',
    password: process.env.SWEAT_MEMBER_PASSWORD ?? 'change-me-now',
    name: process.env.SWEAT_MEMBER_NAME ?? 'Teammate',
  },
]

for (const seededUser of users) {
  const existing = await (db as any)
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, seededUser.email))
    .limit(1)
  if (existing.length) {
    process.stdout.write(`${seededUser.email} already exists\n`)
  } else {
    await auth.api.signUpEmail({ body: seededUser })
    process.stdout.write(`Created ${seededUser.email}\n`)
  }
}
sqlite.close()
