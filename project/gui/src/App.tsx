import { authClient } from '#/lib/auth-client'
import { Dashboard } from '#/features/shell/dashboard'
import { SignIn } from '#/features/auth/sign-in'
import { Toaster } from '#/components/ui/toast'

export function App() {
  const { data: session, isPending } = authClient.useSession()
  if (isPending) return null
  return (
    <>
      {session?.user ? (
        <Dashboard
          user={{
            id: session.user.id,
            name:
              (session.user as typeof session.user & { username?: string })
                .username ?? session.user.name,
            displayName: session.user.name,
            email: session.user.email,
            role: (session.user as typeof session.user & { role?: string })
              .role,
            image: session.user.image ?? undefined,
          }}
        />
      ) : (
        <SignIn />
      )}
      <Toaster />
    </>
  )
}
