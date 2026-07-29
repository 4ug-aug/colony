import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
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

function renderApp() {
  initAuthClient()
  root.render(
    <StrictMode>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <TooltipProvider>
          <WindowDragRegion />
          <App />
        </TooltipProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}

function renderServerSelection() {
  root.render(
    <StrictMode>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <TooltipProvider>
          <WindowDragRegion />
          <ServerSelection onConnected={renderApp} />
        </TooltipProvider>
      </ThemeProvider>
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
