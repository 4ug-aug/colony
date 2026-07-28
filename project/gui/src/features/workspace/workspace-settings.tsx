import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { sweatApiUrl } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '#/components/ui/popover'

type Member = { id: string; email: string; name: string; banned?: boolean | null; username?: string }
type Invitation = { id: string; expiresAt: number; state: string; token?: string; url?: string }

export function WorkspaceSettings() {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [days, setDays] = useState<1 | 3 | 7>(3)
  const [newLink, setNewLink] = useState<string>()
  const [error, setError] = useState<string>()

  const load = async () => {
    const [memberResponse, invitationResponse] = await Promise.all([
      fetch(sweatApiUrl('/api/workspace/settings/members'), { credentials: 'include' }),
      fetch(sweatApiUrl('/api/workspace/invitations'), { credentials: 'include' }),
    ])
    if (!memberResponse.ok || !invitationResponse.ok) throw new Error('Could not load workspace settings')
    setMembers(((await memberResponse.json()) as { users: Member[] }).users)
    setInvitations(((await invitationResponse.json()) as { invitations: Invitation[] }).invitations)
  }

  useEffect(() => {
    if (!open) return
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load settings'))
  }, [open])

  const createInvitation = async () => {
    const response = await fetch(sweatApiUrl('/api/workspace/invitations'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ days }),
    })
    if (!response.ok) throw new Error('Could not create invitation')
    const invitation = (await response.json()) as Invitation
    setNewLink(invitation.url)
    await load()
  }

  const changeMember = async (member: Member) => {
    const action = member.banned ? 'restore' : 'suspend'
    const response = await fetch(
      sweatApiUrl(`/api/workspace/settings/members/${member.id}/${action}`),
      { method: 'POST', credentials: 'include' },
    )
    if (!response.ok) throw new Error(`Could not ${action} member`)
    await load()
  }

  const revoke = async (id: string) => {
    const response = await fetch(sweatApiUrl(`/api/workspace/invitations/${id}`), {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!response.ok) throw new Error('Could not revoke invitation')
    await load()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Workspace settings"><Settings className="size-4" /></Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-80">
        <PopoverHeader><PopoverTitle>Workspace</PopoverTitle></PopoverHeader>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Members</p>
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{member.username ?? member.name}</span>
              <Button variant="ghost" size="xs" onClick={() => void changeMember(member)}>
                {member.banned ? 'Restore' : 'Suspend'}
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Invite</p>
          <div className="mt-1 flex gap-1">
            <select className="h-8 flex-1 rounded border bg-background px-2 text-sm" value={days} onChange={(event) => setDays(Number(event.target.value) as 1 | 3 | 7)}>
              <option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option>
            </select>
            <Button size="xs" onClick={() => void createInvitation()}>Create</Button>
          </div>
          {newLink && <p className="mt-2 break-all text-xs text-muted-foreground">{newLink}</p>}
          <div className="mt-2 space-y-1">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1">{invitation.state}</span>
                {invitation.state === 'pending' && <Button variant="ghost" size="xs" onClick={() => void revoke(invitation.id)}>Revoke</Button>}
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
