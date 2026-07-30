import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Server } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { Avatar } from '#/components/avatar'
import { Button } from '#/components/ui/button'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Input } from '#/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import type { Author } from '#/features/rooms/types'
import {
  clearServerConfig,
  currentServerBase,
  isTauriRuntime,
} from '#/lib/server-config'

export function AccountSettingsPage({
  user,
  onChangeServer,
}: {
  user: Author
  onChangeServer: () => void
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pending, setPending] = useState<'password' | 'sessions' | 'server'>()
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

  const changeServer = async () => {
    setPending('server')
    try {
      await authClient.signOut()
    } finally {
      try {
        await clearServerConfig()
      } finally {
        onChangeServer()
      }
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

      {isTauriRuntime() && (
        <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
          <h2 className="font-semibold">Connected server</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {currentServerBase()}
          </p>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  disabled={pending !== undefined}
                />
              }
            >
              Change server
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <Server />
                </AlertDialogMedia>
                <AlertDialogTitle>Change server?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will be signed out and disconnected from this workspace.
                  Sweat will return to the server connection screen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={pending !== undefined}
                  onClick={() => void changeServer()}
                >
                  {pending === 'server' ? (
                    <BrailleLoader text="Disconnecting" />
                  ) : (
                    'Change server'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      )}

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
            {pending === 'password' ? (
              <BrailleLoader text="Changing password" />
            ) : (
              'Change password'
            )}
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
          {pending === 'sessions' ? (
            <BrailleLoader text="Signing out" />
          ) : (
            'Sign out other sessions'
          )}
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
