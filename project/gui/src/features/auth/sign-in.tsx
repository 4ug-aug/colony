import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import { authClient, sweatApiUrl } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'

type Mode = 'sign-in' | 'setup' | 'invite'

export function SignIn() {
  const pathToken = window.location.pathname.match(/^\/invite\/([^/]+)$/)?.[1]
  const [mode, setMode] = useState<Mode>(pathToken ? 'invite' : 'sign-in')
  const [identifier, setIdentifier] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [error, setError] = useState<string>()

  useEffect(() => {
    void fetch(sweatApiUrl('/api/admission/status'))
      .then((response) => response.json() as Promise<{ setupRequired?: boolean }>)
      .then((status) => {
        if (status.setupRequired && !pathToken) setMode('setup')
      })
      .catch(() => undefined)
  }, [pathToken])

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    try {
      if (mode === 'sign-in') {
        const result = identifier.includes('@')
          ? await authClient.signIn.email({ email: identifier, password })
          : await authClient.signIn.username({ username: identifier, password })
        if (result.error) setError(result.error.message)
        return
      }
      const token = mode === 'setup' ? setupToken : pathToken
      const response = await fetch(
        sweatApiUrl(
          mode === 'setup'
            ? '/api/admission/setup'
            : `/api/workspace/invitations/${token}/redeem`,
        ),
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            ...(mode === 'setup' ? { 'x-sweat-setup-token': token ?? '' } : {}),
          },
          body: JSON.stringify({ email, username, displayName, password }),
        },
      )
      if (!response.ok) {
        const body = (await response.json()) as { error?: string; message?: string }
        throw new Error(body.error ?? body.message ?? 'Unable to create account')
      }
      window.location.reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to reach Sweat')
    }
  }

  const admission = mode !== 'sign-in'
  return (
    <main className="mx-auto max-w-sm p-8">
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <h1 className="text-2xl font-semibold">
          {mode === 'setup'
            ? 'Set up Sweat'
            : mode === 'invite'
              ? 'Join workspace'
              : 'Sign in'}
        </h1>
        {mode === 'setup' && (
          <input
            className="h-9 w-full rounded-md border bg-background px-3"
            placeholder="Setup token"
            value={setupToken}
            onChange={(event) => setSetupToken(event.target.value)}
            required
          />
        )}
        {admission && (
          <>
            <input
              className="h-9 w-full rounded-md border bg-background px-3"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <input
              className="h-9 w-full rounded-md border bg-background px-3"
              placeholder="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <input
              className="h-9 w-full rounded-md border bg-background px-3"
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </>
        )}
        {!admission && (
          <input
            className="h-9 w-full rounded-md border bg-background px-3"
            placeholder="Email or username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        )}
        <input
          className="h-9 w-full rounded-md border bg-background px-3"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" type="submit">
          {admission ? 'Create account' : 'Sign in'}
        </Button>
        {mode === 'invite' && (
          <Button
            className="w-full"
            variant="link"
            type="button"
            onClick={() => setMode('sign-in')}
          >
            Back to sign in
          </Button>
        )}
      </form>
    </main>
  )
}
