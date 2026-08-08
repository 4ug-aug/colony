import { ThemeProvider } from '#/components/theme-provider'
import { Button } from '#/components/ui/button'
import { Toaster } from '#/components/ui/toast'
import { TooltipProvider } from '#/components/ui/tooltip'
import { SignIn } from '#/features/auth/sign-in'
import { attachBulletinWorkspaceSync } from '#/features/bulletins/bulletin-workspace-sync'
import { attachDocWorkspaceSync } from '#/features/docs/doc-workspace-sync'
import { attachIssueWorkspaceSync } from '#/features/issues/issue-workspace-sync'
import { EntryShell } from '#/features/setup/entry-shell'
import { ServerSelection } from '#/features/setup/server-selection'
import { Dashboard } from '#/features/shell/dashboard'
import { WindowDragRegion } from '#/features/shell/window-toolbar'
import { initAuthClient } from '#/lib/auth-client'
import { initInviteDeepLinks } from '#/lib/invite-deep-link'
import { createAppQueryClient } from '#/lib/query-client'
import {
  currentServerBase,
  initServerConfig,
  isTauriRuntime,
} from '#/lib/server-config'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ErrorInfo, ReactNode } from 'react'
import { Component, StrictMode, useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const rootEl = document.getElementById('root')!
const root = createRoot(rootEl)
const queryClient = createAppQueryClient()

function connectConfiguredServer() {
  initAuthClient()
  attachIssueWorkspaceSync(queryClient)
  attachBulletinWorkspaceSync(queryClient)
  attachDocWorkspaceSync(queryClient)
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App render failed', error, info)
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
    connectConfiguredServer()
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

initServerConfig()
  .then(initInviteDeepLinks)
  .then(() => {
    const needsServer = isTauriRuntime() && !currentServerBase()
    if (!needsServer) connectConfiguredServer()
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
  })
  .catch((err: unknown) => {
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
