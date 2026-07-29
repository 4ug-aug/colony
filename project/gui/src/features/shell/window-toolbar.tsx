import type { CSSProperties } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { SidebarTrigger } from '#/components/ui/sidebar'
import { isTauriRuntime } from '#/lib/server-config'

// Single source of truth for the custom title-bar (bezel) height. The drag
// region and toolbar below are this tall, and the layout reserves the same
// height via the `--titlebar` CSS variable (see titleBarVars) so app content
// sits *below* the bar instead of underneath the traffic lights and controls.
const TITLE_BAR_HEIGHT = '1.5rem' // 24px
// Clears the macOS traffic-light cluster (starts at x=14, ~66px wide) so the
// first control has a little breathing room after it.
const TRAFFIC_LIGHT_INSET = '5.5rem' // 88px
// Nudges the nav controls down so they sit level with the native traffic
// lights. Pair this with `trafficLightPosition.y` in tauri.conf.json (which
// moves the native buttons and needs an app restart to take effect).
const CONTROL_OFFSET_Y = '0.5rem' // 4px

// Spread onto the layout root so the sidebar and main panel reserve space for
// the bar. Resolves to 0 outside Tauri, leaving the web layout unchanged.
export function titleBarVars(): CSSProperties {
  return {
    '--titlebar': isTauriRuntime() ? TITLE_BAR_HEIGHT : '0px',
  } as CSSProperties
}

// Transparent full-width strip that captures window drags. It only needs to be
// draggable — a background here would paint over the content below it.
export function WindowDragRegion() {
  if (!isTauriRuntime()) return null

  return (
    <div
      data-tauri-drag-region
      className="fixed inset-x-0 top-0 z-20 select-none"
      style={{ height: TITLE_BAR_HEIGHT }}
    />
  )
}

export function WindowToolbar() {
  if (!isTauriRuntime()) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center gap-1 text-muted-foreground"
      style={{
        height: TITLE_BAR_HEIGHT,
        paddingLeft: TRAFFIC_LIGHT_INSET,
        transform: `translateY(${CONTROL_OFFSET_Y})`,
      }}
    >
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
  )
}
