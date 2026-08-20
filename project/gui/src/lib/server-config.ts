import { isTauri } from '@tauri-apps/api/core'
import { load } from '@tauri-apps/plugin-store'
import type { Store } from '@tauri-apps/plugin-store'

let base: string | undefined
let store: Store | undefined

const isTauriRuntimeFlag = isTauri()

// In the browser we can resolve the default eagerly at module load.
// This makes currentServerBase() synchronously available before initServerConfig() runs.
if (!isTauriRuntimeFlag && typeof window !== 'undefined') {
  base =
    import.meta.env.VITE_SWEAT_API_URL ??
    `${window.location.protocol}//${window.location.hostname}:3001`
}

export function isTauriRuntime(): boolean {
  return isTauriRuntimeFlag
}

export function currentServerBase(): string | undefined {
  return base
}

export const sweatApiUrl = (path = ''): string => {
  const origin = currentServerBase()
  if (!origin) throw new Error('Server base URL is not configured')
  return new URL(path, `${origin.replace(/\/$/, '')}/`).toString()
}

export async function initServerConfig(): Promise<void> {
  if (isTauriRuntimeFlag) {
    store = await load('sweat.json')
    const stored = await store.get<string>('serverUrl')
    base = stored ?? import.meta.env.VITE_SWEAT_API_URL
  }
}

export async function setServerBase(url: string): Promise<void> {
  base = url
  if (isTauriRuntimeFlag && store) {
    await store.set('serverUrl', url)
    await store.save()
  }
}

export async function clearServerConfig(): Promise<void> {
  base = undefined
  if (isTauriRuntimeFlag && store) {
    await store.delete('serverUrl')
    await store.save()
  }
}
