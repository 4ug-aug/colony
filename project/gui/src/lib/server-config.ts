import { isTauri } from '@tauri-apps/api/core'
import { load } from '@tauri-apps/plugin-store'
import type { Store } from '@tauri-apps/plugin-store'

// Module-level state
let _base: string | undefined
let _store: Store | undefined

// Detect Tauri at module load (sync)
const _isTauri = isTauri()

// In the browser we can resolve the default eagerly at module load.
// This makes currentServerBase() synchronously available before initServerConfig() runs.
if (!_isTauri && typeof window !== 'undefined') {
  _base =
    import.meta.env.VITE_SWEAT_API_URL ??
    `${window.location.protocol}//${window.location.hostname}:3001`
}

export function isTauriRuntime(): boolean {
  return _isTauri
}

export function currentServerBase(): string | undefined {
  return _base
}

export async function initServerConfig(): Promise<void> {
  if (_isTauri) {
    _store = await load('sweat.json')
    const stored = await _store.get<string>('serverUrl')
    _base = stored ?? import.meta.env.VITE_SWEAT_API_URL
  }
  // Browser: _base already set eagerly at module load; nothing to do.
}

export async function setServerBase(url: string): Promise<void> {
  _base = url
  if (_isTauri && _store) {
    await _store.set('serverUrl', url)
    await _store.save()
  }
}

export async function clearServerConfig(): Promise<void> {
  _base = undefined
  if (_isTauri && _store) {
    await _store.delete('serverUrl')
    await _store.save()
  }
}
