import { useEffect, useState } from 'react'
import { apiFetch } from '#/lib/api-transport'
import { ProviderIcon } from '#/components/provider-icon'
import { Button } from '#/components/ui/button'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  defaultLlmBaseUrl,
  llmProviderName,
  type LlmProvider,
} from '#/lib/llm-provider'
import {
  Check
} from 'lucide-react'

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
type LlmConfig = {
  configured: boolean
  provider?: LlmProvider
  baseUrl?: string
  model?: string
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
  const [llm, setLlm] = useState<LlmConfig>({ configured: false })
  const [provider, setProvider] = useState<LlmProvider>('openai')
  const [baseUrl, setBaseUrl] = useState(defaultLlmBaseUrl('openai'))
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')

  const load = async () => {
    setError(undefined)
    const [memberResponse, invitationResponse, llmResponse] = await Promise.all(
      [
        apiFetch('/api/workspace/settings/members'),
        apiFetch('/api/workspace/invitations'),
        apiFetch('/api/workspace/settings/llm'),
      ],
    )
    if (!memberResponse.ok || !invitationResponse.ok || !llmResponse.ok)
      throw new Error('Could not load workspace settings')
    setMembers(((await memberResponse.json()) as { users: Member[] }).users)
    setInvitations(
      ((await invitationResponse.json()) as { invitations: Invitation[] })
        .invitations,
    )
    const config = (await llmResponse.json()) as LlmConfig
    setLlm(config)
    setProvider(config.provider ?? 'openai')
    setBaseUrl(config.baseUrl ?? defaultLlmBaseUrl(config.provider ?? 'openai'))
    setModel(config.model ?? '')
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
      const response = await apiFetch('/api/workspace/invitations', {
        method: 'POST',
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
      const response = await apiFetch(
        `/api/workspace/settings/members/${member.id}/${action}`,
        { method: 'POST' },
      )
      if (!response.ok) throw new Error(`Could not ${action} member`)
      await load()
    })

  const revoke = (id: string) =>
    mutate(async () => {
      if (!window.confirm('Revoke this invitation link?')) return
      const response = await apiFetch(`/api/workspace/invitations/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Could not revoke invitation')
      await load()
    })

  const saveLlm = () =>
    mutate(async () => {
      const response = await apiFetch('/api/workspace/settings/llm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, baseUrl, model, apiKey }),
      })
      const result = (await response.json()) as LlmConfig & { error?: string }
      if (!response.ok)
        throw new Error(result.error ?? 'Could not save provider')
      setLlm(result)
      setProvider(result.provider ?? 'openai')
      setBaseUrl(result.baseUrl ?? '')
      setModel(result.model ?? '')
      setApiKey('')
    })

  return (
    <div className="mx-auto w-full max-w-full space-y-6 p-4 sm:p-8">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {(loading || busy) && (
        <p className="text-sm text-muted-foreground" role="status">
          <BrailleLoader
            text={loading ? 'Loading workspace settings' : 'Saving changes'}
          />
        </p>
      )}
      <section className="border-b pb-4">
        <h2 className="font-semibold">LLM provider</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the OpenAI-compatible provider used for new agent runs.
        </p>
        <div className="mt-4 grid max-w-xl gap-3">
          <Select
            value={provider}
            disabled={busy || loading}
            onValueChange={(value) => {
              const next = value as LlmProvider
              setProvider(next)
              setBaseUrl(defaultLlmBaseUrl(next))
            }}
          >
            <SelectTrigger className="w-full" aria-label="LLM provider">
              <SelectValue>
                {(value) => {
                  const selected = value as LlmProvider
                  return (
                    <>
                      <ProviderIcon provider={selected} />
                      {llmProviderName(selected)}
                    </>
                  )
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(['openai', 'custom'] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    <ProviderIcon provider={value} />
                    {llmProviderName(value)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            aria-label="LLM base URL"
            disabled={busy || loading}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.openai.com/v1"
            value={baseUrl}
          />
          <Input
            aria-label="LLM model"
            disabled={busy || loading}
            onChange={(event) => setModel(event.target.value)}
            placeholder="gpt-4.1-mini"
            value={model}
          />
          <Input
            aria-label="LLM API key"
            disabled={busy || loading}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              llm.configured ? 'Leave blank to keep current key' : 'API key'
            }
            type="password"
            value={apiKey}
          />
          <div className="flex items-center gap-3">
            <Button disabled={busy || loading} onClick={() => void saveLlm()}>
              Save provider
            </Button>
            <span className="text-sm text-muted-foreground">
              {llm.configured ? (
                <span className="inline-flex items-center gap-1 text-green-600">
                  <Check className="w-4 h-4" />
                  Configured
                </span>
              ) : (
                'Not configured'
              )}
         
            </span>
          </div>
        </div>
      </section>

      <section className="border-b pb-4">
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
              <SelectGroup>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
              </SelectGroup>
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

      <section>
        <h2 className="font-semibold">Members</h2>
        <p className="mt-1 text-sm text-muted-foreground mb-4">
          Suspend or restore workspace access.
        </p>
        <div className="border rounded-md divide-y">  
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
