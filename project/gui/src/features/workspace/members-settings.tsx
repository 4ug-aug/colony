import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import { AgentThinking } from '#/components/ui/agent-thinking'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { toast } from '#/components/ui/toast'
import { SettingsCard } from '#/features/workspace/settings-card'
import { apiFetch, apiJson, apiJsonBody } from '#/lib/api-transport'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

type Member = {
  id: string
  email: string
  name: string
  banned?: boolean | null
  username?: string
  role?: string
}

const workspaceSettingsMembersQueryKey = [
  'workspace-settings',
  'members',
] as const

function useSettingsMembers() {
  return useQuery({
    queryKey: workspaceSettingsMembersQueryKey,
    queryFn: async () => {
      const body = await apiJson<{ users: Member[] }>(
        '/api/workspace/settings/members',
        undefined,
        'Could not load members',
      )
      return body.users
    },
  })
}

export function MembersSettings({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient()
  const {
    data: members = [],
    isPending,
    error,
    isFetching,
  } = useSettingsMembers()
  const [resetMember, setResetMember] = useState<Member>()
  const [newPassword, setNewPassword] = useState('')

  const changeMember = useMutation({
    mutationFn: async (member: Member) => {
      const action = member.banned ? 'restore' : 'suspend'
      const response = await apiFetch(
        `/api/workspace/settings/members/${member.id}/${action}`,
        { method: 'POST' },
      )
      if (!response.ok) throw new Error(`Could not ${action} member`)
      return { member, action }
    },
    onSuccess: ({ member, action }) => {
      const name = member.username ?? member.name
      toast.add({
        type: 'success',
        title: action === 'restore' ? 'Member restored' : 'Member suspended',
        description:
          action === 'restore'
            ? `${name} can sign in again.`
            : `${name} was signed out.`,
      })
      void queryClient.invalidateQueries({
        queryKey: workspaceSettingsMembersQueryKey,
      })
    },
    onError: (reason) => {
      toast.add({
        type: 'error',
        title: 'Could not update member',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    },
  })

  const resetPassword = useMutation({
    mutationFn: ({ member, password }: { member: Member; password: string }) =>
      apiJsonBody(
        `/api/workspace/settings/members/${member.id}/password`,
        'POST',
        { newPassword: password },
        'Could not reset password',
      ),
    onSuccess: (_result, { member }) => {
      setResetMember(undefined)
      setNewPassword('')
      toast.add({
        type: 'success',
        title: 'Password reset',
        description: `Existing sessions for ${member.username ?? member.name} were signed out.`,
      })
    },
    onError: (reason) => {
      toast.add({
        type: 'error',
        title: 'Could not reset password',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    },
  })

  const changeRole = useMutation({
    mutationFn: ({
      member,
      role,
    }: {
      member: Member
      role: 'admin' | 'user'
    }) =>
      apiJsonBody(
        `/api/workspace/settings/members/${member.id}/role`,
        'POST',
        { role },
        'Could not update administrator access',
      ),
    onSuccess: (_result, { member, role }) => {
      const name = member.username ?? member.name
      toast.add({
        type: 'success',
        title:
          role === 'admin' ? 'Administrator added' : 'Administrator removed',
        description:
          role === 'admin'
            ? `${name} is now an administrator.`
            : `${name} no longer has workspace settings access.`,
      })
      void queryClient.invalidateQueries({
        queryKey: workspaceSettingsMembersQueryKey,
      })
    },
    onError: (reason) => {
      toast.add({
        type: 'error',
        title: 'Could not update administrator access',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    },
  })

  const busy =
    changeMember.isPending ||
    resetPassword.isPending ||
    changeRole.isPending ||
    isFetching

  return (
    <SettingsCard
      title="Members"
      description="Reset passwords, change administrator access, or suspend workspace access."
    >
      {error && (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Could not load members'}
        </p>
      )}
      {isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          <AgentThinking label="Loading members" />
        </p>
      ) : (
        <div className="divide-y divide-border/40">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {member.username ?? member.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {member.role === 'admin' ? 'Administrator · ' : ''}
                  {member.name !== (member.username ?? member.name)
                    ? `${member.name} · `
                    : ''}
                  {member.email}
                </span>
              </span>
              {member.id !== currentUserId && (
                <span className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setResetMember(member)
                      setNewPassword('')
                    }}
                  >
                    Reset password
                  </Button>
                  {member.role === 'admin' ? (
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button variant="outline" size="sm" disabled={busy} />
                        }
                      >
                        Remove administrator
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Remove administrator from{' '}
                            {member.username ?? member.name}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            They will lose workspace settings access.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            disabled={changeRole.isPending}
                            onClick={() =>
                              changeRole.mutate({ member, role: 'user' })
                            }
                          >
                            Remove administrator
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        changeRole.mutate({ member, role: 'admin' })
                      }
                    >
                      Make administrator
                    </Button>
                  )}
                  {member.role !== 'admin' &&
                    (member.banned ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => changeMember.mutate(member)}
                      >
                        Restore
                      </Button>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                            />
                          }
                        >
                          Suspend
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Suspend {member.username ?? member.name}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              They will be signed out and cannot sign in until
                              restored.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              disabled={changeMember.isPending}
                              onClick={() => changeMember.mutate(member)}
                            >
                              Suspend
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={Boolean(resetMember)}
        onOpenChange={(open) => {
          if (!open && !resetPassword.isPending) setResetMember(undefined)
        }}
      >
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (resetMember)
                resetPassword.mutate({
                  member: resetMember,
                  password: newPassword,
                })
            }}
          >
            <DialogHeader>
              <DialogTitle>
                Reset password for {resetMember?.username ?? resetMember?.name}
              </DialogTitle>
              <DialogDescription>
                Their existing sessions will be signed out.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoComplete="new-password"
              autoFocus
              className="my-4"
              minLength={8}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
              required
              type="password"
              value={newPassword}
            />
            <DialogFooter>
              <Button
                disabled={resetPassword.isPending}
                onClick={() => setResetMember(undefined)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={resetPassword.isPending} type="submit">
                {resetPassword.isPending ? (
                  <AgentThinking label="Resetting" />
                ) : (
                  'Reset password'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  )
}
