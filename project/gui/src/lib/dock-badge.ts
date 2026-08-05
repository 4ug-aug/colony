import { isTauriRuntime } from '#/lib/server-config'

export async function setAppDockBadge(visible: boolean): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().setBadgeCount(visible ? 1 : undefined)
  } catch {
    // Badge is best-effort; never break chat over dock permissions.
  }
}
