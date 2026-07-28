import { useEffect, useState } from 'react'
import { sweatApiUrl } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'

type Member = {
  id: string
  email: string
  name: string
  banned?: boolean | null
  username?: string
  role?: string
}
type Invitation = {
  id: string
  createdAt: number
  expiresAt: number
  state: 'pending' | 'expired' | 'revoked' | 'redeemed'
}

export function WorkspaceSettingsPage({
  currentUserId,
}: {
  currentUserId: string
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [days, setDays] = useState<1 | 3 | 7>(3)
  const [newLink, setNewLink] = useState<string>()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = async () => {
    setError(undefined)
    const [memberResponse, invitationResponse] = await Promise.all([
      fetch(sweatApiUrl('/api/workspace/settings/members'), {
        credentials: 'include',
      }),
      fetch(sweatApiUrl('/api/workspace/invitations'), {
        credentials: 'include',
      }),
    ])
    if (!memberResponse.ok || !invitationResponse.ok)
      throw new Error('Could not load workspace settings')
    setMembers(((await memberResponse.json()) as { users: Member[] }).users)
    setInvitations(
      ((await invitationResponse.json()) as { invitations: Invitation[] })
        .invitations,
    )
  }

  useEffect(() => {
    void load()
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : 'Could not load settings',
        ),
      )
      .finally(() => setLoading(false))
  }, [])

  const mutate = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const createInvitation = () =>
    mutate(async () => {
      const response = await fetch(sweatApiUrl('/api/workspace/invitations'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days }),
      })
      if (!response.ok) throw new Error('Could not create invitation')
      const invitation = (await response.json()) as { url: string }
      setNewLink(invitation.url)
      setCopied(false)
      await load()
    })

  const copyInvitation = async () => {
    if (!newLink) return
    try {
      await navigator.clipboard.writeText(newLink)
      setCopied(true)
    } catch {
      setError('Could not copy the invitation link')
    }
  }

  const changeMember = (member: Member) =>
    mutate(async () => {
      const action = member.banned ? 'restore' : 'suspend'
      if (
        action === 'suspend' &&
        !window.confirm(
          `Suspend ${member.username ?? member.name} and sign them out?`,
        )
      )
        return
      const response = await fetch(
        sweatApiUrl(`/api/workspace/settings/members/${member.id}/${action}`),
        { method: 'POST', credentials: 'include' },
      )
      if (!response.ok) throw new Error(`Could not ${action} member`)
      await load()
    })

  const revoke = (id: string) =>
    mutate(async () => {
      if (!window.confirm('Revoke this invitation link?')) return
      const response = await fetch(
        sweatApiUrl(`/api/workspace/invitations/${id}`),
        {
          method: 'DELETE',
          credentials: 'include',
        },
      )
      if (!response.ok) throw new Error('Could not revoke invitation')
      await load()
    })

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6 sm:p-8">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
        <h2 className="font-semibold">Invitation links</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a single-use link to invite someone to this workspace.
        </p>
        <div className="mt-4 flex max-w-sm gap-2">
          <Select
            value={String(days)}
            disabled={busy || loading}
            onValueChange={(value) => setDays(Number(value) as 1 | 3 | 7)}
          >
            <SelectTrigger className="flex-1" aria-label="Invitation lifetime">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 day</SelectItem>
              <SelectItem value="3">3 days</SelectItem>
              <SelectItem value="7">7 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            disabled={busy || loading}
            onClick={() => void createInvitation()}
          >
            Create link
          </Button>
        </div>
        {newLink && (
          <div className="mt-3 flex max-w-xl items-center gap-2">
            <Input
              aria-label="Invitation link"
              className="min-w-0 font-mono text-xs"
              value={newLink}
              readOnly
            />
            <Button variant="outline" onClick={() => void copyInvitation()}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        )}
        <div className="mt-5 space-y-2">
          <h3 className="text-sm font-medium">Recent invitations</h3>
          {!loading && invitations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No invitations created yet.
            </p>
          )}
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="block capitalize">{invitation.state}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  Expires {new Date(invitation.expiresAt).toLocaleString()}
                </span>
              </span>
              {invitation.state === 'pending' && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void revoke(invitation.id)}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
        <h2 className="font-semibold">Members</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Suspend or restore workspace access.
        </p>
        <div className="mt-4 divide-y">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 py-3">
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
                  onClick={() => void changeMember(member)}
                >
                  {member.banned ? 'Restore' : 'Suspend'}
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
