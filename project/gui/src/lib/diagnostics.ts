import { isTauriRuntime } from '#/lib/server-config'

// Installed builds ship no web inspector, so a "blank white window" report has
// to be reconstructable from the log file alone. Breadcrumbs make the *last*
// line written the diagnosis: boot steps are logged in order, so a log ending
// at `config-loaded` means the promise chain in main.tsx never resolved, while
// a log ending at `module-loaded` means the webview died or hung before that.
// A hang leaves no error behind — only the missing next breadcrumb.

async function write(level: 'info' | 'error', message: string): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    const log = await import('@tauri-apps/plugin-log')
    await log[level](message)
  } catch {
    // Never let diagnostics be the thing that breaks startup.
  }
}

export function logBoot(step: string): void {
  console.info(`boot: ${step}`)
  void write('info', `boot: ${step}`)
}

export function reportError(what: string, detail: unknown): void {
  console.error(what, detail)
  const text =
    detail instanceof Error
      ? `${detail.message}\n${detail.stack ?? '<no stack>'}`
      : String(detail)
  void write('error', `${what}: ${text}`)
}

// Uncaught errors and rejections bypass React's error boundary entirely; with
// no console to read, these two listeners are the only way they reach disk.
export function initErrorReporting(): void {
  window.addEventListener('error', (event) => {
    reportError('uncaught error', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportError('unhandled rejection', event.reason)
  })
}
