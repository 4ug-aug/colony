import { createAuthClient } from 'better-auth/react'
import { usernameClient } from 'better-auth/client/plugins'
import { sweatApiUrl } from '#/lib/server-config'
import { betterAuthFetch } from '#/lib/api-transport'

export type AuthClient = ReturnType<
  typeof createAuthClient<{ plugins: [ReturnType<typeof usernameClient>] }>
>

// eslint-disable-next-line prefer-const
export let authClient: AuthClient

export function initAuthClient() {
  authClient = createAuthClient({
    baseURL: sweatApiUrl(),
    plugins: [usernameClient()],
    fetchOptions: { customFetchImpl: betterAuthFetch },
  }) as AuthClient
}
