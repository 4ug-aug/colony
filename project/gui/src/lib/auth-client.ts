import { createAuthClient } from 'better-auth/react'

const server =
  import.meta.env.VITE_SWEAT_API_URL ??
  `${window.location.protocol}//${window.location.hostname}:3001`

export const sweatApiUrl = (path = ''): string =>
  new URL(path, `${server.replace(/\/$/, '')}/`).toString()

export const authClient = createAuthClient({ baseURL: sweatApiUrl() })
