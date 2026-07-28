import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import { authClient, sweatApiUrl } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'

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
  const [checking, setChecking] = useState(!pathToken)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    void fetch(sweatApiUrl('/api/admission/status'))
      .then((response) => {
        if (!response.ok) throw new Error()
        return response.json() as Promise<{ setupRequired?: boolean }>
      })
      .then((status) => {
        if (status.setupRequired && !pathToken) setMode('setup')
      })
      .catch(() => setError('Unable to reach the Sweat server.'))
      .finally(() => setChecking(false))
  }, [pathToken])

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    setBusy(true)
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
        const body = (await response.json()) as {
          error?: string
          message?: string
        }
        throw new Error(
          body.error ?? body.message ?? 'Unable to create account',
        )
      }
      window.location.reload()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to reach Sweat',
      )
    } finally {
      setBusy(false)
    }
  }

  const admission = mode !== 'sign-in'
  if (checking)
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <p className="text-sm text-muted-foreground">Connecting to Sweat…</p>
      </main>
    )
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <form
        className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
        onSubmit={(event) => void submit(event)}
      >
        <h1 className="text-2xl font-semibold">
          {mode === 'setup'
            ? 'Set up Sweat'
            : mode === 'invite'
              ? 'Join workspace'
              : 'Sign in'}
        </h1>
        {mode === 'setup' && (
          <Input
            placeholder="Setup token"
            aria-label="Setup token"
            autoComplete="off"
            value={setupToken}
            onChange={(event) => setSetupToken(event.target.value)}
            disabled={busy}
            required
          />
        )}
        {admission && (
          <>
            <Input
              type="email"
              placeholder="Email"
              aria-label="Email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              required
            />
            <Input
              placeholder="Username"
              aria-label="Username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={busy}
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9_]+"
              required
            />
            <Input
              placeholder="Display name (optional)"
              aria-label="Display name"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={busy}
            />
          </>
        )}
        {!admission && (
          <Input
            placeholder="Email or username"
            aria-label="Email or username"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            disabled={busy}
            required
          />
        )}
        <Input
          type="password"
          placeholder="Password"
          aria-label="Password"
          autoComplete={admission ? 'new-password' : 'current-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
          minLength={8}
          required
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" type="submit" disabled={busy}>
          {busy ? 'Working…' : admission ? 'Create account' : 'Sign in'}
        </Button>
        {mode === 'invite' && (
          <Button
            className="w-full"
            variant="link"
            type="button"
            onClick={() => setMode('sign-in')}
            disabled={busy}
          >
            Back to sign in
          </Button>
        )}
      </form>
    </main>
  )
}
