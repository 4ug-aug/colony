import { Component, StrictMode } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
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
import { WindowDragRegion } from '#/features/shell/window-toolbar'

const rootEl = document.getElementById('root')!
const root = createRoot(rootEl)

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

function renderApp() {
  initAuthClient()
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
          <TooltipProvider>
            <WindowDragRegion />
            <App />
          </TooltipProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
}

function renderServerSelection() {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
          <TooltipProvider>
            <WindowDragRegion />
            <ServerSelection onConnected={renderApp} />
          </TooltipProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
}

initServerConfig()
  .then(() => {
    if (isTauriRuntime() && !currentServerBase()) {
      renderServerSelection()
    } else {
      renderApp()
    }
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
