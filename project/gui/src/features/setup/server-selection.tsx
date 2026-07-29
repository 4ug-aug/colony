import { useState } from 'react'
import { setServerBase } from '#/lib/server-config'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'

export function ServerSelection({ onConnected }: { onConnected: () => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    setBusy(true)
    try {
      // Normalize: strip trailing slash
      const normalized = url.trim().replace(/\/$/, '')
      // Validate reachability via Tauri's http plugin directly,
      // since apiFetch depends on a configured base
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
      const response = await tauriFetch(`${normalized}/api/admission/status`)
      if (!response.ok && response.status !== 404) {
        // Accept any non-network-error (2xx or even known server error codes)
        throw new Error('Unexpected response')
      }
      await setServerBase(normalized)
      onConnected()
    } catch {
      setError("Couldn't reach a Sweat server at that address.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center p-6">
      <form
        className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
        onSubmit={(event) => void submit(event)}
      >
        <h1 className="text-2xl font-semibold">Connect to Sweat</h1>
        <p className="text-sm text-muted-foreground">
          Enter the address of your Sweat server.
        </p>
        <Input
          type="url"
          placeholder="http://localhost:3001"
          aria-label="Server URL"
          autoComplete="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={busy}
          required
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" type="submit" disabled={busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </Button>
      </form>
    </main>
  )
}
