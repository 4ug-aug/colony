import { auth } from '#/lib/auth'
import type { RoomUser } from './room-store'
import type { SessionAuthenticator } from './coordinator'

export const betterAuthSessionAuthenticator: SessionAuthenticator = {
  async authenticate(request): Promise<RoomUser | undefined> {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user) return undefined
    return {
      id: session.user.id,
      name: session.user.name,
      ...(session.user.image ? { image: session.user.image } : {}),
    }
  },
}
