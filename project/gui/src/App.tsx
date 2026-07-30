import { useEffect } from 'react'
import { authClient } from '#/lib/auth-client'
import { Dashboard } from '#/features/shell/dashboard'

type DashboardUser = Parameters<typeof Dashboard>[0]['user']

export function App({
  onSession,
}: {
  onSession: (user?: DashboardUser) => void
}) {
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (isPending) return
    onSession(
      session?.user
        ? {
            id: session.user.id,
            name:
              (session.user as typeof session.user & { username?: string })
                .username ?? session.user.name,
            displayName: session.user.name,
            email: session.user.email,
            role: (session.user as typeof session.user & { role?: string })
              .role,
            image: session.user.image ?? undefined,
          }
        : undefined,
    )
  }, [isPending, onSession, session?.user])

  return null
}
