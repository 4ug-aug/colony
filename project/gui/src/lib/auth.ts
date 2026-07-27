import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { authSchema, db } from '#/lib/database'

const appOrigin = process.env.SWEAT_GUI_ORIGIN ?? 'http://localhost:3000'
const trustedOrigins = [
  appOrigin,
  ...(new URL(appOrigin).hostname === 'localhost'
    ? ['http://localhost:*']
    : []),
]

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite', schema: authSchema }),
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
  secret: process.env.BETTER_AUTH_SECRET || undefined,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
  },
})
