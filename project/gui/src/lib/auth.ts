import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'
import { username } from 'better-auth/plugins/username'
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
    // HTTP sign-up is gated by the admission routes; internal seed/setup code
    // still uses Better Auth's normal email/password account creation.
    disableSignUp: false,
  },
  plugins: [username(), admin()],
})
