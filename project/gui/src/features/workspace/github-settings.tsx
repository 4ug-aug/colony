import { AgentThinking } from '#/components/ui/agent-thinking'
import { Button } from '#/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import { Input } from '#/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { Textarea } from '#/components/ui/textarea'
import { toast } from '#/components/ui/toast'
import { SettingsCard } from '#/features/workspace/settings-card'
import { apiJson, apiJsonBody } from '#/lib/api-transport'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronsUpDown, ExternalLink } from 'lucide-react'
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
  // Bumped on every key edit so listings refetch with the new key without putting it in a query key.
  const [keyRevision, setKeyRevision] = useState(0)
  const canList = /^\d+$/.test(appId.trim()) && (config.configured || Boolean(privateKey.trim()))
  const credentials = { appId, privateKey }

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
        <Input
          aria-label="GitHub App ID"
          disabled={busy}
          inputMode="numeric"
          onChange={(event) => setAppId(event.target.value)}
          placeholder="App ID"
          value={appId}
        />
        <Textarea
          aria-label="GitHub App private key"
          className="font-mono"
          disabled={busy}
          onChange={(event) => {
            setPrivateKey(event.target.value)
            setKeyRevision((revision) => revision + 1)
          }}
          placeholder={
            config.configured
              ? 'Leave blank to keep current private key'
              : 'Paste the .pem private key'
          }
          rows={3}
          value={privateKey}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <GitHubPicker
            label="Repository"
            placeholder="Select a repository"
            value={repository}
            disabled={busy || !canList}
            queryKey={['repositories', appId, keyRevision]}
            load={async () =>
              (
                await apiJsonBody<{
                  repositories: { fullName: string; defaultBranch: string }[]
                }>(
                  '/api/workspace/settings/github/repositories',
                  'POST',
                  credentials,
                  'Could not list repositories',
                )
              ).repositories.map((entry) => ({
                value: entry.fullName,
                detail: entry.defaultBranch,
              }))
            }
            empty="No repositories. Install the App on one first."
            onSelect={(option) => {
              setRepository(option.value)
              if (option.detail) setBase(option.detail)
            }}
          />
          <GitHubPicker
            label="Base branch"
            placeholder="Select a branch"
            value={base}
            disabled={busy || !canList || !repository}
            queryKey={['branches', appId, keyRevision, repository]}
            load={async () =>
              (
                await apiJsonBody<{ branches: string[] }>(
                  '/api/workspace/settings/github/branches',
                  'POST',
                  { ...credentials, repository },
                  'Could not list branches',
                )
              ).branches.map((name) => ({ value: name }))
            }
            empty="No branches found."
            onSelect={(option) => setBase(option.value)}
          />
        </div>
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

type PickerOption = { value: string; detail?: string }

/* Searchable list loaded from GitHub when opened. */
function GitHubPicker({
  label,
  placeholder,
  value,
  disabled,
  queryKey,
  load,
  empty,
  onSelect,
}: {
  label: string
  placeholder: string
  value: string
  disabled: boolean
  queryKey: readonly unknown[]
  load: () => Promise<PickerOption[]>
  empty: string
  onSelect: (option: PickerOption) => void
}) {
  const [open, setOpen] = useState(false)
  const options = useQuery({
    queryKey: [...githubQueryKey, ...queryKey],
    queryFn: load,
    enabled: open,
    retry: false,
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            aria-label={label}
            className="w-full justify-between font-normal"
            variant="outline"
          />
        }
      >
        <span className={value ? 'truncate' : 'truncate text-muted-foreground'}>
          {value || placeholder}
        </span>
        <ChevronsUpDown className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-64 p-0">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList>
            {options.isPending ? (
              <p className="p-3 text-sm text-muted-foreground" role="status">
                <AgentThinking label={`Loading ${label.toLowerCase()}`} />
              </p>
            ) : options.error ? (
              <p className="p-3 text-sm text-destructive" role="alert">
                {options.error instanceof Error
                  ? options.error.message
                  : `Could not load ${label.toLowerCase()}`}
              </p>
            ) : (
              <>
                <CommandEmpty>{empty}</CommandEmpty>
                <CommandGroup>
                  {options.data.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      className="[&>svg:last-child]:hidden"
                      onSelect={() => {
                        onSelect(option)
                        setOpen(false)
                      }}
                    >
                      <span className="flex-1 truncate">{option.value}</span>
                      <span className="flex size-4 items-center justify-center">
                        {option.value === value && (
                          <Check className="size-3.5 text-muted-foreground" />
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
