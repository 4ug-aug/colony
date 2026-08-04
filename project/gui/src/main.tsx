// Must stay the first import: it logs at import time, and every import below
// evaluates before any statement in this file runs.
import { initErrorReporting, logBoot, reportError } from '#/lib/diagnostics'
import { Component, StrictMode, useCallback, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import './styles.css'
import { Button } from '#/components/ui/button'
import { TooltipProvider } from '#/components/ui/tooltip'
import { ThemeProvider } from '#/components/theme-provider'
import {
  initServerConfig,
  isTauriRuntime,
  currentServerBase,
} from '#/lib/server-config'
import { initAuthClient } from '#/lib/auth-client'
import { ServerSelection } from '#/features/setup/server-selection'
import { EntryShell } from '#/features/setup/entry-shell'
import { Dashboard } from '#/features/shell/dashboard'
import { SignIn } from '#/features/auth/sign-in'
import { Toaster } from '#/components/ui/toast'
import { WindowDragRegion } from '#/features/shell/window-toolbar'
import { initInviteDeepLinks } from '#/lib/invite-deep-link'
import { createAppQueryClient } from '#/lib/query-client'

const rootEl = document.getElementById('root')!
const root = createRoot(rootEl)
const queryClient = createAppQueryClient()

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError('app render failed', error)
    console.error('component stack', info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main
        className="grid min-h-svh place-items-center p-6 text-center"
        role="alert"
      >
        <div className="flex max-w-sm flex-col items-center gap-3">
          <h1 className="text-xl font-semibold">Sweat hit a problem</h1>
          <p className="text-sm text-muted-foreground">
            Reload the app to try again.
          </p>
          <Button type="button" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
      </main>
    )
  }
}

type DashboardUser = Parameters<typeof Dashboard>[0]['user']
type EntryPhase = 'entry' | 'exiting' | 'dashboard'

function EntryFlow({ needsServer }: { needsServer: boolean }) {
  const [selectingServer, setSelectingServer] = useState(needsServer)
  const [authReady, setAuthReady] = useState(!needsServer)
  const [user, setUser] = useState<DashboardUser>()
  const [phase, setPhase] = useState<EntryPhase>('entry')
  const onChangeServer = useCallback(() => {
    setUser(undefined)
    setPhase('entry')
    setAuthReady(false)
    setSelectingServer(true)
  }, [])
  const onConnected = useCallback(() => {
    initAuthClient()
    setAuthReady(true)
    setSelectingServer(false)
  }, [])
  const onSession = useCallback((nextUser?: DashboardUser) => {
    setUser(nextUser)
    setPhase((current) => {
      if (!nextUser) return 'entry'
      if (current === 'dashboard') return current
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'dashboard'
        : 'exiting'
    })
  }, [])

  return (
    <>
      {authReady && <App onSession={onSession} />}
      {phase === 'dashboard' && user ? (
        <Dashboard user={user} onChangeServer={onChangeServer} />
      ) : (
        <EntryShell
          exiting={phase === 'exiting'}
          onExitComplete={() => setPhase(user ? 'dashboard' : 'entry')}
        >
          {selectingServer ? (
            <ServerSelection onConnected={onConnected} />
          ) : (
            <SignIn onChangeServer={onChangeServer} />
          )}
        </EntryShell>
      )}
    </>
  )
}

initErrorReporting()
logBoot('module-loaded')

initServerConfig()
  .then(() => logBoot('config-loaded'))
  .then(initInviteDeepLinks)
  .then(() => {
    logBoot('deep-links-ready')
    const needsServer = isTauriRuntime() && !currentServerBase()
    if (!needsServer) initAuthClient()
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
              <TooltipProvider>
                <WindowDragRegion />
                <EntryFlow needsServer={needsServer} />
                <Toaster />
              </TooltipProvider>
            </ThemeProvider>
          </ErrorBoundary>
        </QueryClientProvider>
      </StrictMode>,
    )
    logBoot('render-called')
    // Fires only once the webview actually paints, so a log stopping at
    // `render-called` points at a UI thread blocked mid-paint rather than
    // anything an error handler could catch. Weak evidence on its own though:
    // rAF is also throttled while the window is hidden, so a missing
    // `first-paint` is only meaningful for a window the user can see.
    requestAnimationFrame(() => logBoot('first-paint'))
  })
  .catch((err: unknown) => {
    reportError('startup failed', err)
    root.render(
      <StrictMode>
        <WindowDragRegion />
        <main className="grid min-h-svh place-items-center p-6">
          <p className="text-sm text-destructive">
            Failed to initialize:{' '}
            {err instanceof Error ? err.message : String(err)}
          </p>
        </main>
      </StrictMode>,
    )
  })
