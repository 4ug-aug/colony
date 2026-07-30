import { useState } from 'react'
import { setServerBase } from '#/lib/server-config'
import { Button } from '#/components/ui/button'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Input } from '#/components/ui/input'

export function ServerSelection({ onConnected }: { onConnected: () => void }) {
  const [url, setUrl] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    setPending(true)
    try {
      // Normalize: strip trailing slash
      const normalized = url.trim().replace(/\/$/, '')
      // Validate reachability via Tauri's http plugin directly,
      // since apiFetch depends on a configured base
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
      const response = await tauriFetch(`${normalized}/api/admission/status`)
      await response.arrayBuffer()
      if (!response.ok && response.status !== 404) {
        // Accept any non-network-error (2xx or even known server error codes)
        throw new Error('Unexpected response')
      }
      await setServerBase(normalized)
      onConnected()
    } catch {
      setError("Couldn't reach a Sweat server at that address.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="entry-form flex flex-col gap-4"
      onSubmit={(event) => void submit(event)}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <img
          src="/app-icon.png"
          alt=""
          className="size-7 rounded-md bg-white p-1"
        />
        Sweat
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Connect to Sweat</h1>
        <p className="text-sm text-muted-foreground">
          Enter the address of your Sweat server.
        </p>
      </div>
      <Input
        type="url"
        placeholder="http://localhost:3001"
        aria-label="Server URL"
        autoComplete="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        disabled={pending}
        required
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? <BrailleLoader text="Connecting" /> : 'Connect'}
      </Button>
    </form>
  )
}
