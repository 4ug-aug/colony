// Installed builds ship no web inspector, so a "blank white window" report has
// to be reconstructable from the log file alone. Breadcrumbs make the *last*
// line written the diagnosis.
//
// Dispatch is deliberately synchronous. `invoke` posts the message to Rust
// before it returns, so a breadcrumb survives a UI thread that blocks a moment
// later. An earlier version awaited `import('@tauri-apps/plugin-log')` instead
// and lost every breadcrumb to a hang during module evaluation — the empty log
// read as "no JavaScript ran at all", which was wrong and cost a whole build to
// find out. Nothing here may await, fetch a chunk, or import a module.

type TauriInternals = {
  invoke: (cmd: string, args: unknown) => Promise<unknown>
}

// plugin-log's LogLevel is a plain int: Trace 1, Debug 2, Info 3, Warn 4,
// Error 5. Sent as a literal to avoid importing the plugin for one enum.
function write(level: 3 | 5, message: string): void {
  try {
    const internals = (window as { __TAURI_INTERNALS__?: TauriInternals })
      .__TAURI_INTERNALS__
    // A rejection here (permission denied) must not reach the rejection
    // handler below, which would call straight back into `write`.
    void internals?.invoke('plugin:log|log', { level, message }).catch(() => {})
  } catch {
    // Never let diagnostics be the thing that breaks startup.
  }
}

export function logBoot(step: string): void {
  console.info(`boot: ${step}`)
  write(3, `boot: ${step}`)
}

export function reportError(what: string, detail: unknown): void {
  console.error(what, detail)
  const text =
    detail instanceof Error
      ? `${detail.message}\n${detail.stack ?? '<no stack>'}`
      : String(detail)
  write(5, `${what}: ${text}`)
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

// Runs at import time, so it lands before the rest of main.tsx's import graph
// evaluates. `bundle-entered` with no `module-loaded` after it means a later
// top-level import hung or threw — the one failure mode a breadcrumb placed in
// main.tsx's body can never report, because imports evaluate first.
logBoot('bundle-entered')
