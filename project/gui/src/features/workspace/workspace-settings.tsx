import { Markdown } from '#/components/markdown'
import { ProviderIcon } from '#/components/provider-icon'
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
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { agentDefinitionsQueryKey } from '#/features/agents/use-agent-definitions'
import { apiFetch } from '#/lib/api-transport'
import {
  defaultLlmBaseUrl,
  llmProviderName,
  type LlmProvider,
} from '#/lib/llm-provider'
import { useQueryClient } from '@tanstack/react-query'
import {
  Check
} from 'lucide-react'
import { useEffect, useState } from 'react'

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
type CursorRuntimeConfig = {
  configured: boolean
  model?: string
}
type CursorModel = {
  id: string
  displayName: string
}
type WorkspaceSkill = {
  id: string
  name: string
  description: string
}
type SkillAgent = {
  id: string
  name: string
}
type SkillPackageDetail = {
  skill: WorkspaceSkill
  files: { path: string; content: string }[]
}

function skillMarkdownBody(content: string): string {
  if (!content.startsWith('---')) return content
  const end = content.indexOf('\n---', 3)
  if (end === -1) return content
  return content.slice(end + 4).replace(/^\r?\n/, '')
}

export function WorkspaceSettingsPage({
  currentUserId,
}: {
  currentUserId: string
}) {
  const queryClient = useQueryClient()
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
  const [cursorRuntime, setCursorRuntime] = useState<CursorRuntimeConfig>({
    configured: false,
  })
  const [cursorModel, setCursorModel] = useState('')
  const [cursorApiKey, setCursorApiKey] = useState('')
  const [cursorModels, setCursorModels] = useState<CursorModel[]>([])
  const [skills, setSkills] = useState<WorkspaceSkill[]>([])
  const [skillAttachments, setSkillAttachments] = useState<
    Record<string, string[]>
  >({})
  const [skillAgents, setSkillAgents] = useState<SkillAgent[]>([])
  const [skillFile, setSkillFile] = useState<File | null>(null)
  const [pendingSkillId, setPendingSkillId] = useState<string>()
  const [viewingSkillId, setViewingSkillId] = useState<string>()
  const [skillDetail, setSkillDetail] = useState<SkillPackageDetail>()
  const [skillDetailLoading, setSkillDetailLoading] = useState(false)

  const load = async () => {
    setError(undefined)
    const [
      memberResponse,
      invitationResponse,
      llmResponse,
      cursorResponse,
      skillsResponse,
    ] = await Promise.all([
      apiFetch('/api/workspace/settings/members'),
      apiFetch('/api/workspace/invitations'),
      apiFetch('/api/workspace/settings/llm'),
      apiFetch('/api/workspace/settings/cursor-runtime'),
      apiFetch('/api/workspace/settings/skills'),
    ])
    if (
      !memberResponse.ok ||
      !invitationResponse.ok ||
      !llmResponse.ok ||
      !cursorResponse.ok ||
      !skillsResponse.ok
    )
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
    const cursor = (await cursorResponse.json()) as CursorRuntimeConfig
    setCursorRuntime(cursor)
    setCursorModel(cursor.model ?? '')
    if (cursor.configured) {
      const modelsResponse = await apiFetch(
        '/api/workspace/settings/cursor-runtime/models',
      )
      if (modelsResponse.ok) {
        const body = (await modelsResponse.json()) as { models: CursorModel[] }
        setCursorModels(body.models)
      } else {
        setCursorModels([])
      }
    } else {
      setCursorModels([])
    }
    const skillBody = (await skillsResponse.json()) as {
      skills: WorkspaceSkill[]
      attachments: Record<string, string[]>
      agents: SkillAgent[]
    }
    setSkills(skillBody.skills)
    setSkillAttachments(skillBody.attachments)
    setSkillAgents(skillBody.agents)
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

  const refreshAgentDefinitions = () =>
    void queryClient.refetchQueries({ queryKey: agentDefinitionsQueryKey })

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

  const saveCursorRuntime = () =>
    mutate(async () => {
      const response = await apiFetch('/api/workspace/settings/cursor-runtime', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: cursorModel,
          apiKey: cursorApiKey,
        }),
      })
      const result = (await response.json()) as CursorRuntimeConfig & {
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error ?? 'Could not save Cursor runtime')
      setCursorRuntime(result)
      setCursorModel(result.model ?? '')
      setCursorApiKey('')
      const modelsResponse = await apiFetch(
        '/api/workspace/settings/cursor-runtime/models',
      )
      if (modelsResponse.ok) {
        const body = (await modelsResponse.json()) as { models: CursorModel[] }
        setCursorModels(body.models)
      }
    })

  const importSkill = () =>
    mutate(async () => {
      if (!skillFile) throw new Error('Choose a SKILL.md or skill package zip')
      const body = new FormData()
      body.set('package', skillFile)
      const response = await apiFetch('/api/workspace/settings/skills', {
        method: 'POST',
        body,
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok)
        throw new Error(result.error ?? 'Could not import skill package')
      setSkillFile(null)
      await load()
      refreshAgentDefinitions()
    })

  const deleteSkill = async (skill: WorkspaceSkill) => {
    setError(undefined)
    setPendingSkillId(skill.id)
    const previousSkills = skills
    const previousAttachments = skillAttachments
    setSkills((current) => current.filter((entry) => entry.id !== skill.id))
    setSkillAttachments((attachments) => {
      const next: Record<string, string[]> = {}
      for (const [agentId, skillIds] of Object.entries(attachments)) {
        next[agentId] = skillIds.filter((id) => id !== skill.id)
      }
      return next
    })
    try {
      const response = await apiFetch(
        `/api/workspace/settings/skills/${encodeURIComponent(skill.id)}`,
        { method: 'DELETE' },
      )
      if (!response.ok) throw new Error('Could not delete skill')
      refreshAgentDefinitions()
    } catch (reason) {
      setSkills(previousSkills)
      setSkillAttachments(previousAttachments)
      setError(
        reason instanceof Error ? reason.message : 'Could not delete skill',
      )
    } finally {
      setPendingSkillId(undefined)
    }
  }

  const openSkillDetail = async (skillId: string) => {
    setViewingSkillId(skillId)
    setSkillDetail(undefined)
    setSkillDetailLoading(true)
    setError(undefined)
    try {
      const response = await apiFetch(
        `/api/workspace/settings/skills/${encodeURIComponent(skillId)}`,
      )
      const result = (await response.json()) as SkillPackageDetail & {
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error ?? 'Could not load skill')
      setSkillDetail({
        skill: result.skill,
        files: result.files,
      })
    } catch (reason) {
      setViewingSkillId(undefined)
      setError(
        reason instanceof Error ? reason.message : 'Could not load skill',
      )
    } finally {
      setSkillDetailLoading(false)
    }
  }

  const toggleSkillAttachment = async (
    agentDefinitionId: string,
    skillId: string,
    attached: boolean,
  ) => {
    setError(undefined)
    setPendingSkillId(skillId)
    const previous = skillAttachments
    const current = skillAttachments[agentDefinitionId] ?? []
    const skillIds = attached
      ? current.filter((id) => id !== skillId)
      : [...current, skillId]
    setSkillAttachments({
      ...skillAttachments,
      [agentDefinitionId]: skillIds,
    })
    try {
      const response = await apiFetch(
        `/api/workspace/settings/skills/attachments/${encodeURIComponent(agentDefinitionId)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ skillIds }),
        },
      )
      const result = (await response.json()) as {
        skillIds?: string[]
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error ?? 'Could not update skill attachments')
      setSkillAttachments((attachments) => ({
        ...attachments,
        [agentDefinitionId]: result.skillIds ?? skillIds,
      }))
      refreshAgentDefinitions()
    } catch (reason) {
      setSkillAttachments(previous)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not update skill attachments',
      )
    } finally {
      setPendingSkillId(undefined)
    }
  }

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
        <h2 className="font-semibold">Cursor agent runtime</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional Cursor local SDK runtime for{' '}
          <code className="text-xs">@software-engineer</code> runs. This is
          separate from the OpenAI-compatible LLM provider used by{' '}
          <code className="text-xs">@antboy</code>.
        </p>
        <div className="mt-4 grid max-w-xl gap-3">
          <Input
            aria-label="Cursor API key"
            disabled={busy || loading}
            onChange={(event) => setCursorApiKey(event.target.value)}
            placeholder={
              cursorRuntime.configured
                ? 'Leave blank to keep current key'
                : 'Cursor API key'
            }
            type="password"
            value={cursorApiKey}
          />
          {cursorModels.length > 0 ? (
            <Select
              value={cursorModel}
              disabled={busy || loading}
              onValueChange={(value) => setCursorModel(value ?? '')}
            >
              <SelectTrigger className="w-full" aria-label="Cursor model">
                <SelectValue placeholder="Select a Cursor model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {cursorModels.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.displayName}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <Input
              aria-label="Cursor model"
              disabled={busy || loading}
              onChange={(event) => setCursorModel(event.target.value)}
              placeholder="composer-2.5"
              value={cursorModel}
            />
          )}
          <div className="flex items-center gap-3">
            <Button
              disabled={busy || loading}
              onClick={() => void saveCursorRuntime()}
            >
              Save Cursor runtime
            </Button>
            <span className="text-sm text-muted-foreground">
              {cursorRuntime.configured ? (
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
        <h2 className="font-semibold">Agent skills</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Import a <code className="text-xs">SKILL.md</code> file or a zip of a
          markdown Agent Skills package, then attach it to agent definitions.
          Skills are staged into each runtime&apos;s expected layout at run
          start.
        </p>
        <div className="mt-4 grid gap-3">
          <div className="grid max-w-xl gap-3">
            <Input
              aria-label="Skill markdown or package zip"
              disabled={busy || loading}
              onChange={(event) =>
                setSkillFile(event.target.files?.[0] ?? null)
              }
              type="file"
              accept=".md,.zip,text/markdown,application/zip"
            />
            <div className="flex items-center gap-3">
              <Button
                disabled={busy || loading || !skillFile}
                onClick={() => void importSkill()}
              >
                Import skill
              </Button>
            </div>
          </div>
          {skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No skills imported yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {skills.map((skill) => {
                const skillBusy = pendingSkillId === skill.id
                return (
                <li
                  key={skill.id}
                  className="flex h-full flex-col rounded-md border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-sm text-left outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => void openSkillDetail(skill.id)}
                    >
                      <p className="font-medium">{skill.name}</p>
                      <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                        {skill.description}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy || loading || skillBusy}
                        onClick={() => void openSkillDetail(skill.id)}
                      >
                        View
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy || loading || skillBusy}
                            />
                          }
                        >
                          Delete
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete {skill.name}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the skill from the workspace catalog
                              and detaches it from every agent definition.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={skillBusy}
                              onClick={() => void deleteSkill(skill)}
                            >
                              {skillBusy ? (
                                <BrailleLoader text="Deleting" />
                              ) : (
                                'Delete'
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <div className="mt-auto space-y-2 border-t pt-3">
                    {skillBusy && (
                      <p className="text-sm text-muted-foreground" role="status">
                        <BrailleLoader text="Updating attachments" />
                      </p>
                    )}
                    {skillAgents.map((agent) => {
                      const attached = (
                        skillAttachments[agent.id] ?? []
                      ).includes(skill.id)
                      return (
                        <label
                          key={`${agent.id}-${skill.id}`}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={attached}
                            disabled={busy || loading || skillBusy}
                            onCheckedChange={() =>
                              void toggleSkillAttachment(
                                agent.id,
                                skill.id,
                                attached,
                              )
                            }
                          />
                          Attach to {agent.name}
                        </label>
                      )
                    })}
                  </div>
                </li>
                )
              })}
            </ul>
          )}
        </div>
        <Dialog
          open={viewingSkillId !== undefined}
          onOpenChange={(open) => {
            if (!open) {
              setViewingSkillId(undefined)
              setSkillDetail(undefined)
            }
          }}
        >
          <DialogContent
            className="flex max-h-[min(85vh,44rem)] flex-col gap-3 sm:max-w-2xl"
            showCloseButton
          >
            <DialogHeader>
              <DialogTitle>
                {skillDetail?.skill.name ??
                  skills.find((skill) => skill.id === viewingSkillId)?.name ??
                  'Skill'}
              </DialogTitle>
              <DialogDescription>
                {skillDetail?.skill.description ??
                  skills.find((skill) => skill.id === viewingSkillId)
                    ?.description ??
                  'Full skill package contents.'}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {skillDetailLoading && (
                <p className="text-sm text-muted-foreground" role="status">
                  <BrailleLoader text="Loading skill" />
                </p>
              )}
              {!skillDetailLoading &&
                skillDetail?.files.map((file) => (
                  <section key={file.path} className="mb-6 last:mb-0">
                    {file.path !== 'SKILL.md' && (
                      <h3 className="mb-2 font-mono text-xs font-medium text-muted-foreground">
                        {file.path}
                      </h3>
                    )}
                    <div className="text-sm leading-6">
                      <Markdown>
                        {file.path === 'SKILL.md'
                          ? skillMarkdownBody(file.content)
                          : file.content}
                      </Markdown>
                    </div>
                  </section>
                ))}
            </div>
          </DialogContent>
        </Dialog>
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
