import { AgentThinking } from '#/components/ui/agent-thinking'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { toast } from '#/components/ui/toast'
import { SettingsCard } from '#/features/workspace/settings-card'
import { apiJson, apiJsonBody } from '#/lib/api-transport'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink } from 'lucide-react'
import { useState } from 'react'

export type GitHubConfig = {
  configured: boolean
  appId?: string
  repository?: string
  base?: string
  installUrl?: string
}

const githubQueryKey = ['workspace-settings', 'github'] as const

export function useGitHubSettings(enabled = true) {
  return useQuery({
    queryKey: githubQueryKey,
    queryFn: () =>
      apiJson<GitHubConfig>(
        '/api/workspace/settings/github',
        undefined,
        'Could not load GitHub settings',
      ),
    enabled,
  })
}

const description =
  'The GitHub App agents with GitHub access use to check out the repository and open pull requests. The key stays on the server.'

export function GitHubSettings() {
  const queryClient = useQueryClient()
  const { data, isPending, error } = useGitHubSettings()

  if (isPending) {
    return (
      <SettingsCard title="GitHub">
        <p className="text-sm text-muted-foreground" role="status">
          <AgentThinking label="Loading GitHub settings" />
        </p>
      </SettingsCard>
    )
  }

  if (error || !data) {
    return (
      <SettingsCard title="GitHub">
        <p className="text-sm text-destructive" role="alert">
          {error instanceof Error
            ? error.message
            : 'Could not load GitHub settings'}
        </p>
      </SettingsCard>
    )
  }

  return (
    <GitHubForm
      // Remount on save/clear so the fields reset to the stored values.
      key={JSON.stringify(data)}
      config={data}
      onSaved={(next) => queryClient.setQueryData(githubQueryKey, next)}
    />
  )
}

function GitHubForm({
  config,
  onSaved,
}: {
  config: GitHubConfig
  onSaved: (config: GitHubConfig) => void
}) {
  const [appId, setAppId] = useState(config.appId ?? '')
  const [privateKey, setPrivateKey] = useState('')
  const [repository, setRepository] = useState(config.repository ?? '')
  const [base, setBase] = useState(config.base ?? 'main')

  const failed = (title: string) => (reason: unknown) =>
    toast.add({
      type: 'error',
      title,
      description: reason instanceof Error ? reason.message : 'Please try again.',
    })

  const save = useMutation({
    mutationFn: () =>
      apiJsonBody<GitHubConfig>(
        '/api/workspace/settings/github',
        'POST',
        { appId, privateKey, repository, base },
        'Could not save GitHub settings',
      ),
    onSuccess: (result) => {
      onSaved(result)
      toast.add({ type: 'success', title: 'GitHub saved' })
    },
    onError: failed('Could not save GitHub settings'),
  })

  const clear = useMutation({
    mutationFn: () =>
      apiJsonBody<GitHubConfig>(
        '/api/workspace/settings/github/clear',
        'POST',
        {},
        'Could not clear GitHub settings',
      ),
    onSuccess: (result) => {
      onSaved(result)
      toast.add({ type: 'success', title: 'GitHub cleared' })
    },
    onError: failed('Could not clear GitHub settings'),
  })

  const busy = save.isPending || clear.isPending

  return (
    <SettingsCard title="GitHub" description={description}>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            aria-label="GitHub App ID"
            disabled={busy}
            inputMode="numeric"
            onChange={(event) => setAppId(event.target.value)}
            placeholder="App ID"
            value={appId}
          />
          <Input
            aria-label="Repository"
            disabled={busy}
            onChange={(event) => setRepository(event.target.value)}
            placeholder="owner/repository"
            value={repository}
          />
          <Input
            aria-label="Base branch"
            disabled={busy}
            onChange={(event) => setBase(event.target.value)}
            placeholder="main"
            value={base}
          />
        </div>
        <Textarea
          aria-label="GitHub App private key"
          className="font-mono"
          disabled={busy}
          onChange={(event) => setPrivateKey(event.target.value)}
          placeholder={
            config.configured
              ? 'Leave blank to keep current private key'
              : 'Paste the .pem private key'
          }
          rows={3}
          value={privateKey}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busy} onClick={() => save.mutate()}>
            {save.isPending ? <AgentThinking label="Saving" /> : 'Save GitHub'}
          </Button>
          {config.configured && (
            <Button
              disabled={busy}
              onClick={() => clear.mutate()}
              variant="outline"
            >
              Clear
            </Button>
          )}
          {config.installUrl && (
            <Button
              variant="link"
              render={
                <a href={config.installUrl} target="_blank" rel="noreferrer" />
              }
            >
              Install on GitHub
              <ExternalLink />
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {config.configured ? (
              <span className="inline-flex items-center gap-1 text-green-500">
                <Check className="size-3.5" />
                Configured
              </span>
            ) : (
              'Not configured'
            )}
          </span>
        </div>
      </div>
    </SettingsCard>
  )
}
