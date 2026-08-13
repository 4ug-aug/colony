import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import { apiFetch, apiJson } from '#/lib/api-transport'
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
  const { data: members = [], isPending, error, isFetching } =
    useSettingsMembers()
  const [actionError, setActionError] = useState<string>()

  const changeMember = useMutation({
    mutationFn: async (member: Member) => {
      const action = member.banned ? 'restore' : 'suspend'
      const response = await apiFetch(
        `/api/workspace/settings/members/${member.id}/${action}`,
        { method: 'POST' },
      )
      if (!response.ok) throw new Error(`Could not ${action} member`)
    },
    onSuccess: () => {
      setActionError(undefined)
      void queryClient.invalidateQueries({
        queryKey: workspaceSettingsMembersQueryKey,
      })
    },
    onError: (reason) => {
      setActionError(
        reason instanceof Error ? reason.message : 'Could not update member',
      )
    },
  })

  const requestMemberChange = (member: Member) => {
    const action = member.banned ? 'restore' : 'suspend'
    if (
      action === 'suspend' &&
      !window.confirm(
        `Suspend ${member.username ?? member.name} and sign them out?`,
      )
    )
      return
    changeMember.mutate(member)
  }

  const busy = changeMember.isPending || isFetching

  return (
    <section>
      <h2 className="font-semibold">Members</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        Suspend or restore workspace access.
      </p>
      {(error || actionError) && (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {actionError ??
            (error instanceof Error
              ? error.message
              : 'Could not load members')}
        </p>
      )}
      {isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          <BrailleLoader text="Loading members" />
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {member.username ?? member.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {member.name !== (member.username ?? member.name)
                    ? `${member.name} · `
                    : ''}
                  {member.email}
                </span>
              </span>
              {member.id !== currentUserId && member.role !== 'admin' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => requestMemberChange(member)}
                >
                  {member.banned ? 'Restore' : 'Suspend'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
