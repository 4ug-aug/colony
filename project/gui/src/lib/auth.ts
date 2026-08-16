import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'
import { username } from 'better-auth/plugins/username'
import { parseAccountColor } from '#/lib/account-color'
import { authSchema, db } from '#/lib/database'
import { DESKTOP_ORIGINS } from '#/lib/desktop-origins'

const appOrigin = process.env.SWEAT_GUI_ORIGIN ?? DESKTOP_ORIGINS[0]!
// All desktop origins are trusted, not just the configured one: one server
// serves macOS, Linux, and Windows clients of the same app.
const trustedOrigins = [
  ...new Set([
    appOrigin,
    ...DESKTOP_ORIGINS,
    ...(new URL(appOrigin).hostname === 'localhost'
      ? ['http://localhost:*']
      : []),
  ]),
]

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite', schema: authSchema }),
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
  secret: process.env.BETTER_AUTH_SECRET || undefined,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      color: {
        type: 'string',
        required: false,
        input: true,
      },
    },
  },
  databaseHooks: {
    user: {
      update: {
        before: async (changes, context) => {
          if (
            context &&
            ('username' in changes || 'displayUsername' in changes)
          )
            throw APIError.from('BAD_REQUEST', {
              code: 'USERNAME_IMMUTABLE',
              message: 'Username cannot be changed',
            })
          const next = { ...changes }
          if ('name' in next) {
            const name = typeof next.name === 'string' ? next.name.trim() : ''
            if (!name || name.length > 80)
              throw APIError.from('BAD_REQUEST', {
                code: 'INVALID_DISPLAY_NAME',
                message: 'Display name must be 1 to 80 characters',
              })
            next.name = name
          }
          if ('color' in next) {
            const color = next.color
            if (color == null || color === '') next.color = null
            else if (typeof color !== 'string')
              throw APIError.from('BAD_REQUEST', {
                code: 'INVALID_ACCOUNT_COLOR',
                message: 'Account color must be a hex value',
              })
            else {
              const parsed = parseAccountColor(color)
              if (!parsed)
                throw APIError.from('BAD_REQUEST', {
                  code: 'INVALID_ACCOUNT_COLOR',
                  message: 'Account color must be a hex value',
                })
              next.color = parsed
            }
          }
          return { data: next }
        },
      },
    },
  },
  plugins: [username(), admin()],
})
