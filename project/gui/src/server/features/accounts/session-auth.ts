import { auth } from '#/lib/auth'
import type { RoomUser } from '#/server/features/rooms/room-store'
import type { SessionAuthenticator } from '#/server/coordinator'

/** @public Loaded by the coordinator's runtime import. */
export const betterAuthSessionAuthenticator: SessionAuthenticator = {
  async authenticate(request): Promise<RoomUser | undefined> {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user) return undefined
    const account = session.user as typeof session.user & {
      username?: string
      role?: string
      banned?: boolean | null
      color?: string | null
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
      ...(account.color ? { color: account.color } : {}),
    }
  },
}
