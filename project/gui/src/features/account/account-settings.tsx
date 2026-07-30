import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { authClient } from '#/lib/auth-client'
import { Avatar } from '#/components/avatar'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import type { Author } from '#/features/rooms/types'

export function AccountSettingsPage({ user }: { user: Author }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pending, setPending] = useState<'password' | 'sessions'>()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  const changePassword = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending('password')
    setError(undefined)
    setMessage(undefined)
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })
      if (result.error) return setError(result.error.message)
      setCurrentPassword('')
      setNewPassword('')
      setMessage('Password changed and other sessions signed out.')
    } catch {
      setError('Could not change password.')
    } finally {
      setPending(undefined)
    }
  }

  const revokeOtherSessions = async () => {
    setPending('sessions')
    setError(undefined)
    setMessage(undefined)
    try {
      const result = await authClient.revokeOtherSessions()
      if (result.error) return setError(result.error.message)
      setMessage('Other sessions signed out.')
    } catch {
      setError('Could not sign out other sessions.')
    } finally {
      setPending(undefined)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6 sm:p-8">
      <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <Avatar author={user} details={false} />
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{user.name}</h2>
            {user.displayName && user.displayName !== user.name && (
              <p className="truncate text-sm">{user.displayName}</p>
            )}
            {user.email && (
              <p className="truncate text-sm text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
        <h2 className="font-semibold">Password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Changing your password signs out your other sessions.
        </p>
        <form
          className="mt-4 max-w-sm space-y-3"
          onSubmit={(event) => void changePassword(event)}
        >
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            aria-label="Current password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={pending !== undefined}
            required
          />
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            aria-label="New password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={pending !== undefined}
            minLength={8}
            required
          />
          <Button
            type="submit"
            size="sm"
            aria-busy={pending === 'password'}
            disabled={pending !== undefined}
          >
            {pending === 'password' ? 'Changing…' : 'Change password'}
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          aria-busy={pending === 'sessions'}
          disabled={pending !== undefined}
          onClick={() => void revokeOtherSessions()}
        >
          {pending === 'sessions' ? 'Signing out…' : 'Sign out other sessions'}
        </Button>
        {error && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            {message}
          </p>
        )}
      </section>
    </div>
  )
}
