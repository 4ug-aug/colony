import { authClient } from '#/lib/auth-client'
import { Dashboard } from '#/features/shell/dashboard'
import { SignIn } from '#/features/auth/sign-in'

export function App() {
  const { data: session, isPending } = authClient.useSession()
  if (isPending) return null
  return session?.user ? (
    <Dashboard
      user={{
        id: session.user.id,
        name: session.user.name,
        image: session.user.image ?? undefined,
      }}
    />
  ) : (
    <SignIn />
  )
}
