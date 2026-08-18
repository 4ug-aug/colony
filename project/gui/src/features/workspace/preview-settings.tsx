import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { apiJson, apiJsonBody } from '#/lib/api-transport'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'

type PreviewConfig = {
  configured: boolean
  initCommand?: string
  previewCommand?: string
  guestPort: number
  graceDurationMs: number
}

const previewConfigQueryKey = ['workspace-settings', 'preview'] as const

function usePreviewConfig() {
  return useQuery({
    queryKey: previewConfigQueryKey,
    queryFn: () =>
      apiJson<PreviewConfig>(
        '/api/workspace/settings/preview',
        undefined,
        'Could not load Preview settings',
      ),
  })
}

export function PreviewSettings() {
  const queryClient = useQueryClient()
  const { data, isPending, error, isFetching } = usePreviewConfig()

  if (isPending) {
    return (
      <section className="border-b pb-4">
        <h2 className="font-semibold">Preview</h2>
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          <BrailleLoader text="Loading Preview settings" />
        </p>
      </section>
    )
  }

  if (error || !data) {
    return (
      <section className="border-b pb-4">
        <h2 className="font-semibold">Preview</h2>
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error instanceof Error
            ? error.message
            : 'Could not load Preview settings'}
        </p>
      </section>
    )
  }

  return (
    <PreviewForm
      config={data}
      refreshing={isFetching}
      onSaved={(next) => queryClient.setQueryData(previewConfigQueryKey, next)}
    />
  )
}

function PreviewForm({
  config,
  refreshing,
  onSaved,
}: {
  config: PreviewConfig
  refreshing: boolean
  onSaved: (config: PreviewConfig) => void
}) {
  const [initCommand, setInitCommand] = useState(config.initCommand ?? '')
  const [previewCommand, setPreviewCommand] = useState(
    config.previewCommand ?? '',
  )
  const [guestPort, setGuestPort] = useState(String(config.guestPort))
  const [graceSeconds, setGraceSeconds] = useState(
    String(Math.floor(config.graceDurationMs / 1000)),
  )
  const [formError, setFormError] = useState<string>()

  const save = useMutation({
    mutationFn: () =>
      apiJsonBody<PreviewConfig>(
        '/api/workspace/settings/preview',
        'POST',
        {
          initCommand,
          previewCommand,
          guestPort: Number(guestPort),
          graceDurationMs: Number(graceSeconds) * 1000,
        },
        'Could not save Preview',
      ),
    onSuccess: (result) => {
      setInitCommand(result.initCommand ?? '')
      setPreviewCommand(result.previewCommand ?? '')
      setGuestPort(String(result.guestPort))
      setGraceSeconds(String(Math.floor(result.graceDurationMs / 1000)))
      setFormError(undefined)
      onSaved(result)
    },
    onError: (reason) => {
      setFormError(
        reason instanceof Error ? reason.message : 'Could not save Preview',
      )
    },
  })

  const busy = save.isPending || refreshing

  return (
    <section className="border-b pb-4">
      <h2 className="font-semibold">Preview</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Init must finish (pull, install). Preview is the long-running HTTP
        server. Guest port must match the listen port. Docker in the VM
        should use host networking.
      </p>
      {formError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {formError}
        </p>
      )}
      <div className="mt-4 grid max-w-xl gap-3">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Init command</span>
          <span className="text-xs text-muted-foreground">
            Optional. Runs to completion in /work before Preview starts.
          </span>
          <Input
            disabled={busy}
            onChange={(event) => setInitCommand(event.target.value)}
            placeholder="docker pull nginx:alpine"
            value={initCommand}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-medium">Preview command</span>
          <span className="text-xs text-muted-foreground">
            Long-running. nginx on host networking listens on guest port 80.
          </span>
          <Input
            disabled={busy}
            onChange={(event) => setPreviewCommand(event.target.value)}
            placeholder="docker run --rm --network=host nginx:alpine"
            value={previewCommand}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-medium">Guest port</span>
          <Input
            disabled={busy}
            onChange={(event) => setGuestPort(event.target.value)}
            placeholder="80"
            type="number"
            value={guestPort}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-medium">Preview grace seconds</span>
          <Input
            disabled={busy}
            onChange={(event) => setGraceSeconds(event.target.value)}
            placeholder="300"
            type="number"
            value={graceSeconds}
          />
        </label>
        <div className="flex items-center gap-3">
          <Button disabled={busy} onClick={() => save.mutate()}>
            {save.isPending ? <BrailleLoader text="Saving" /> : 'Save Preview'}
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
