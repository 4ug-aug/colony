import type { CSSProperties } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { ModeToggle } from '#/components/mode-toggle'
import { Button } from '#/components/ui/button'
import { SidebarTrigger } from '#/components/ui/sidebar'
import { isTauriRuntime } from '#/lib/server-config'

// Single source of truth for the custom title-bar (bezel) height. The drag
// region and toolbar below are this tall, and the layout reserves the same
// height via the `--titlebar` CSS variable (see titleBarVars) so app content
// sits *below* the bar instead of underneath the traffic lights and controls.
const TITLE_BAR_HEIGHT = '2rem' // 24px
// Clears the macOS traffic-light cluster (starts at x=14, ~66px wide) so the
// first control has a little breathing room after it.
const TRAFFIC_LIGHT_INSET = '5.5rem' // 88px
// Nudges the nav controls down so they sit level with the native traffic
// lights. Pair this with `trafficLightPosition.y` in tauri.conf.json (which
// moves the native buttons and needs an app restart to take effect).
const CONTROL_OFFSET_Y = '0.3rem' // 4px

// `titleBarStyle: "Overlay"` and `trafficLightPosition` are macOS-only keys.
// Windows and Linux keep a native title bar above the webview, so the two
// allowances above would reserve space for traffic lights that aren't there.
const hasOverlayTitleBar = (): boolean =>
  isTauriRuntime() && navigator.userAgent.includes('Mac')

// Spread onto the layout root so the sidebar and main panel reserve space for
// the bar. Resolves to 0 outside Tauri, leaving the web layout unchanged.
export function titleBarVars(): CSSProperties {
  return {
    '--titlebar': isTauriRuntime() ? TITLE_BAR_HEIGHT : '0px',
  } as CSSProperties
}

// Transparent full-width strip that captures window drags. It only needs to be
// draggable — a background here would paint over the content below it. Skipped
// where the native title bar already handles dragging, so a drag on Windows
// content doesn't move the window.
export function WindowDragRegion() {
  if (!hasOverlayTitleBar()) return null

  return (
    <div
      data-tauri-drag-region
      className="fixed inset-x-0 top-0 z-20 select-none"
      style={{ height: TITLE_BAR_HEIGHT }}
    />
  )
}

export function WindowToolbar() {
  const tauri = isTauriRuntime()

  if (!tauri) {
    return (
      <div className="pointer-events-auto fixed top-2 right-2 z-30">
        <ModeToggle />
      </div>
    )
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-1 pr-2 text-muted-foreground"
      style={{
        height: TITLE_BAR_HEIGHT,
        paddingLeft: hasOverlayTitleBar() ? TRAFFIC_LIGHT_INSET : '0.5rem',
        transform: hasOverlayTitleBar()
          ? `translateY(${CONTROL_OFFSET_Y})`
          : undefined,
      }}
    >
      <div className="flex items-center gap-1">
        <SidebarTrigger
          className="pointer-events-auto size-7"
          title="Toggle sidebar"
        />
        <Button
          className="pointer-events-auto size-7"
          variant="ghost"
          size="icon"
          aria-label="Go back"
          title="Go back"
          onClick={() => window.history.back()}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          className="pointer-events-auto size-7"
          variant="ghost"
          size="icon"
          aria-label="Go forward"
          title="Go forward"
          onClick={() => window.history.forward()}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <div className="pointer-events-auto pr-2">
        <ModeToggle />
      </div>
    </div>
  )
}
