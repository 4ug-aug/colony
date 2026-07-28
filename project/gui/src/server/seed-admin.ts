import { auth } from '#/lib/auth'
import { sqlite } from '#/lib/database'

const users = [
  {
    email: process.env.SWEAT_ADMIN_EMAIL ?? 'admin@sweat.local',
    password: process.env.SWEAT_ADMIN_PASSWORD ?? 'change-me-now',
    name: process.env.SWEAT_ADMIN_NAME ?? 'Admin',
    username: process.env.SWEAT_ADMIN_USERNAME ?? 'admin',
    role: 'admin' as const,
  },
  {
    email: process.env.SWEAT_MEMBER_EMAIL ?? 'teammate@sweat.local',
    password: process.env.SWEAT_MEMBER_PASSWORD ?? 'change-me-now',
    name: process.env.SWEAT_MEMBER_NAME ?? 'Teammate',
    username: process.env.SWEAT_MEMBER_USERNAME ?? 'teammate',
    role: 'user' as const,
  },
]

const context = await auth.$context
for (const seededUser of users) {
  const existing = await context.internalAdapter.findUserByEmail(
    seededUser.email,
  )
  if (existing) {
    const account = existing.user as typeof existing.user & {
      username?: string
      role?: string
    }
    if (
      account.username !== seededUser.username ||
      account.role !== seededUser.role
    )
      await context.internalAdapter.updateUser(existing.user.id, {
        id: existing.user.id,
        username: seededUser.username,
        displayUsername: seededUser.username,
        role: seededUser.role,
      })
    process.stdout.write(`${seededUser.email} already exists\n`)
  } else {
    const response = await auth.api.createUser({
      body: {
        email: seededUser.email,
        password: seededUser.password,
        name: seededUser.name,
        role: seededUser.role,
        data: {
          username: seededUser.username,
          displayUsername: seededUser.username,
        },
      },
      asResponse: true,
    })
    if (!response.ok) throw new Error(await response.text())
    process.stdout.write(`Created ${seededUser.email}\n`)
  }
}
sqlite.close()
