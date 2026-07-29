import { createAuthClient } from 'better-auth/react'
import { usernameClient } from 'better-auth/client/plugins'
import { currentServerBase } from '#/lib/server-config'
import { betterAuthFetch } from '#/lib/api-transport'

export const sweatApiUrl = (path = ''): string => {
  const base = currentServerBase()
  if (!base) throw new Error('Server base URL is not configured')
  return new URL(path, `${base.replace(/\/$/, '')}/`).toString()
}

// Type-alias that captures the full client shape including plugins
type AuthClient = ReturnType<typeof createAuthClient<{ plugins: [ReturnType<typeof usernameClient>] }>>

// eslint-disable-next-line prefer-const
export let authClient: AuthClient

export function initAuthClient() {
  authClient = createAuthClient({
    baseURL: sweatApiUrl(),
    plugins: [usernameClient()],
    fetchOptions: { customFetchImpl: betterAuthFetch },
  }) as AuthClient
}
