import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '#/components/ui/sheet'
import { useMediaQuery } from '#/hooks/use-media-query'
import { cn } from '#/lib/utils'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { useRef, useState } from 'react'
import { useDashboardStore } from './dashboard-store'

// Key predates the shared rail; kept so saved widths survive.
const widthKey = 'thread.width'
const minWidth = 360
const maxWidth = 640
const minRoomWidth = 480
const keyboardStep = 16

const clampWidth = (width: number) =>
  Math.round(Math.max(minWidth, Math.min(width, maxWidth)))

function savedWidth() {
  try {
    const saved = parseFloat(localStorage.getItem(widthKey) ?? '')
    // Older builds saved `26rem`-style values and wider limits.
    return Number.isFinite(saved) ? `${clampWidth(saved)}px` : '26rem'
  } catch {
    return '26rem'
  }
}

function saveWidth(width: string) {
  try {
    localStorage.setItem(widthKey, width)
  } catch {
    // Storage blocked; the width just won't persist.
  }
}

export function RoomSideRail({
  label,
  description,
  className,
  sheetClassName,
  children,
}: {
  label: string
  description: string
  className?: string
  sheetClassName?: string
  children: ReactNode
}) {
  const inline = useMediaQuery('(min-width: 1024px)')
  const closeSideSurface = useDashboardStore.getState().closeSideSurface
  const [initialWidth] = useState(savedWidth)
  const railRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ x: number; width: number }>(undefined)

  // Width is written straight to the DOM so dragging never re-renders the
  // Room or rail; React only learns about it on the next mount.
  const resize = (width: number) => {
    const rail = railRef.current
    if (!rail) return
    const room = rail.parentElement?.clientWidth ?? Infinity
    const next = clampWidth(Math.min(width, room - minRoomWidth))
    rail.style.width = `${next}px`
  }
  const commit = () => {
    const width = railRef.current?.style.width
    if (width) saveWidth(width)
  }

  if (inline)
    return (
      <aside
        ref={railRef}
        className={cn(
          'relative flex h-full min-h-0 shrink-0 flex-col border-l',
          className,
        )}
        style={{ width: initialWidth }}
        aria-label={label}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label.toLowerCase()}`}
          tabIndex={0}
          className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none outline-none hover:bg-border focus-visible:bg-ring"
          onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
            if (event.button !== 0 || !railRef.current) return
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            dragRef.current = {
              x: event.clientX,
              width: railRef.current.offsetWidth,
            }
          }}
          onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current
            if (drag) resize(drag.width + drag.x - event.clientX)
          }}
          onPointerUp={() => {
            if (!dragRef.current) return
            dragRef.current = undefined
            commit()
          }}
          onLostPointerCapture={() => {
            dragRef.current = undefined
          }}
          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
            const delta =
              event.key === 'ArrowLeft'
                ? keyboardStep
                : event.key === 'ArrowRight'
                  ? -keyboardStep
                  : 0
            if (!delta || !railRef.current) return
            event.preventDefault()
            resize(railRef.current.offsetWidth + delta)
            commit()
          }}
        />
        {children}
      </aside>
    )

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) closeSideSurface()
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          'flex w-full max-w-none flex-col gap-0 p-0 transition-none sm:max-w-md',
          sheetClassName,
        )}
      >
        <SheetTitle className="sr-only">{label}</SheetTitle>
        <SheetDescription className="sr-only">{description}</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  )
}
