import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Server } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { parseAccountColor } from '#/lib/account-color'
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
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(user.displayName ?? '')
  const [color, setColor] = useState(user.color)
  const [hexInput, setHexInput] = useState(user.color ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pending, setPending] = useState<
    'profile' | 'password' | 'sessions' | 'server'
  >()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [version, setVersion] = useState<string>()
  const preview = { ...user, displayName, color }
  const saveProfile = useMutation({
    mutationFn: async () => {
      const parsed = hexInput.trim() ? parseAccountColor(hexInput) : undefined
      if (hexInput.trim() && !parsed)
        throw new Error('Enter a hex color like #1d4ed8')
      const result = await authClient.updateUser({
        name: displayName.trim() || user.name,
        color: parsed ?? '',
      } as Parameters<typeof authClient.updateUser>[0])
      if (result.error) throw new Error(result.error.message)
      return parsed
    },
    onSuccess: async (parsed) => {
      setColor(parsed)
      setHexInput(parsed ?? '')
      await queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
      setMessage('Profile saved.')
      setError(undefined)
    },
    onError: (reason) =>
      setError(
        reason instanceof Error && reason.message.startsWith('Enter a hex')
          ? reason.message
          : 'Could not save profile.',
      ),
  })

  useEffect(() => {
    if (isTauriRuntime()) void getVersion().then(setVersion)
  }, [])

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
    <div className="mx-auto w-full space-y-6 p-6 sm:p-8">
      <section className="border-b pb-4">
        <div className="flex items-center gap-3">
          <Avatar author={preview} details={false} />
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{user.name}</h2>
            {preview.displayName && preview.displayName !== user.name && (
              <p className="truncate text-sm">{preview.displayName}</p>
            )}
            {user.email && (
              <p className="truncate text-sm text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
        </div>
        <form
          className="mt-4 max-w-sm space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            setPending('profile')
            setError(undefined)
            setMessage(undefined)
            void saveProfile.mutateAsync().finally(() => setPending(undefined))
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Display name</span>
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              placeholder={user.name}
              aria-label="Display name"
              disabled={pending !== undefined}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Account color</span>
            <Input
              value={hexInput}
              onChange={(event) => {
                const value = event.target.value
                setHexInput(value)
                if (!value.trim()) {
                  setColor(undefined)
                  return
                }
                const parsed = parseAccountColor(value)
                if (parsed) setColor(parsed)
              }}
              placeholder="#1d4ed8"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              maxLength={7}
              aria-label="Account color hex"
              disabled={pending !== undefined}
            />
            <span className="text-xs text-muted-foreground">
              Leave blank for an automatic color.
            </span>
          </label>
          <Button
            type="submit"
            size="sm"
            aria-busy={pending === 'profile'}
            disabled={pending !== undefined}
          >
            {pending === 'profile' ? (
              <BrailleLoader text="Saving profile" />
            ) : (
              'Save profile'
            )}
          </Button>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="text-xs text-muted-foreground" role="status">
              {message}
            </p>
          )}
        </form>
      </section>

      {isTauriRuntime() && (
        <section className="border-b pb-4">
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
                  Colony will return to the server connection screen.
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

      <section>
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

      {version && (
        <p className="text-xs text-muted-foreground">Colony {version}</p>
      )}
    </div>
  )
}
