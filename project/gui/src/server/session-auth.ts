import { auth } from '#/lib/auth'
import type { RoomUser } from './room-store'
import type { SessionAuthenticator } from './coordinator'

export const betterAuthSessionAuthenticator: SessionAuthenticator = {
  async authenticate(request): Promise<RoomUser | undefined> {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user) return undefined
    const account = session.user as typeof session.user & {
      username?: string
      role?: string
      banned?: boolean | null
    }
    if (account.banned) return undefined
    return {
      id: session.user.id,
      name: account.username ?? session.user.name,
      displayName: session.user.name,
      email: session.user.email,
      ...(account.username ? { username: account.username } : {}),
      ...(account.role ? { role: account.role } : {}),
      ...(account.banned != null ? { banned: account.banned } : {}),
      ...(session.user.image ? { image: session.user.image } : {}),
    }
  },
}
