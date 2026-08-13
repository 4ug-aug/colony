import { ProviderIcon } from '#/components/provider-icon'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { apiJson, apiJsonBody } from '#/lib/api-transport'
import {
  defaultLlmBaseUrl,
  llmProviderName,
  type LlmProvider,
} from '#/lib/llm-provider'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'

type LlmConfig = {
  configured: boolean
  provider?: LlmProvider
  baseUrl?: string
  model?: string
}

const llmConfigQueryKey = ['workspace-settings', 'llm'] as const

function useLlmConfig() {
  return useQuery({
    queryKey: llmConfigQueryKey,
    queryFn: () =>
      apiJson<LlmConfig>(
        '/api/workspace/settings/llm',
        undefined,
        'Could not load LLM settings',
      ),
  })
}

export function LlmProviderSettings() {
  const queryClient = useQueryClient()
  const { data, isPending, error, isFetching } = useLlmConfig()

  if (isPending) {
    return (
      <section className="border-b pb-4">
        <h2 className="font-semibold">LLM provider</h2>
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          <BrailleLoader text="Loading LLM settings" />
        </p>
      </section>
    )
  }

  if (error || !data) {
    return (
      <section className="border-b pb-4">
        <h2 className="font-semibold">LLM provider</h2>
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Could not load LLM settings'}
        </p>
      </section>
    )
  }

  return (
    <LlmProviderForm
      config={data}
      refreshing={isFetching}
      onSaved={(next) => queryClient.setQueryData(llmConfigQueryKey, next)}
    />
  )
}

function LlmProviderForm({
  config,
  refreshing,
  onSaved,
}: {
  config: LlmConfig
  refreshing: boolean
  onSaved: (config: LlmConfig) => void
}) {
  const [provider, setProvider] = useState<LlmProvider>(
    config.provider ?? 'openai',
  )
  const [baseUrl, setBaseUrl] = useState(
    config.baseUrl ?? defaultLlmBaseUrl(config.provider ?? 'openai'),
  )
  const [model, setModel] = useState(config.model ?? '')
  const [apiKey, setApiKey] = useState('')
  const [formError, setFormError] = useState<string>()

  const save = useMutation({
    mutationFn: () =>
      apiJsonBody<LlmConfig>(
        '/api/workspace/settings/llm',
        'POST',
        { provider, baseUrl, model, apiKey },
        'Could not save provider',
      ),
    onSuccess: (result) => {
      setProvider(result.provider ?? 'openai')
      setBaseUrl(result.baseUrl ?? '')
      setModel(result.model ?? '')
      setApiKey('')
      setFormError(undefined)
      onSaved(result)
    },
    onError: (reason) => {
      setFormError(
        reason instanceof Error ? reason.message : 'Could not save provider',
      )
    },
  })

  const busy = save.isPending || refreshing

  return (
    <section className="border-b pb-4">
      <h2 className="font-semibold">LLM provider</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure the OpenAI-compatible provider used for new agent runs.
      </p>
      {formError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {formError}
        </p>
      )}
      <div className="mt-4 grid max-w-xl gap-3">
        <Select
          value={provider}
          disabled={busy}
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
          disabled={busy}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://api.openai.com/v1"
          value={baseUrl}
        />
        <Input
          aria-label="LLM model"
          disabled={busy}
          onChange={(event) => setModel(event.target.value)}
          placeholder="gpt-4.1-mini"
          value={model}
        />
        <Input
          aria-label="LLM API key"
          disabled={busy}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            config.configured ? 'Leave blank to keep current key' : 'API key'
          }
          type="password"
          value={apiKey}
        />
        <div className="flex items-center gap-3">
          <Button disabled={busy} onClick={() => save.mutate()}>
            {save.isPending ? <BrailleLoader text="Saving" /> : 'Save provider'}
          </Button>
          <span className="text-sm text-muted-foreground">
            {config.configured ? (
              <span className="inline-flex items-center gap-1 text-green-600">
                <Check className="h-4 w-4" />
                Configured
              </span>
            ) : (
              'Not configured'
            )}
          </span>
        </div>
      </div>
    </section>
  )
}
