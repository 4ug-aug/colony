import type { AnimationEvent, ReactNode } from 'react'
import { Dithering } from '@paper-design/shaders-react'
import { useTheme } from '#/components/theme-provider'
import { titleBarVars } from '#/features/shell/window-toolbar'

export function EntryShell({
  children,
  exiting = false,
  onExitComplete,
}: {
  children: ReactNode
  exiting?: boolean
  onExitComplete?: () => void
}) {
  const { theme } = useTheme()
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches

  return (
    <main
      className="h-svh overflow-y-auto bg-muted/40 p-3 pt-[calc(0.75rem+var(--titlebar,0px))] sm:p-5 sm:pt-[calc(1.25rem+var(--titlebar,0px))]"
      style={titleBarVars()}
    >
      <div
        className={`entry-shell-frame mx-auto grid min-h-[calc(100svh-1.5rem-var(--titlebar,0px))] max-w-6xl overflow-hidden rounded-3xl border bg-card shadow-sm sm:min-h-[calc(100svh-2.5rem-var(--titlebar,0px))] md:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]${exiting ? ' entry-shell-frame--exiting' : ''}`}
        onAnimationEnd={(event: AnimationEvent<HTMLDivElement>) => {
          if (
            event.target === event.currentTarget &&
            event.animationName === 'entry-shell-out'
          ) {
            onExitComplete?.()
          }
        }}
      >
        <div
          className="entry-shell-art relative m-2 min-h-44 overflow-hidden rounded-2xl sm:m-3 md:min-h-0"
          aria-hidden="true"
        >
          <Dithering
            className="absolute inset-0"
            width="100%"
            height="100%"
            colorBack={dark ? '#1c1a19' : '#f0efe8'}
            colorFront={dark ? '#dedbd2' : '#282522'}
            shape="warp"
            type="4x4"
            size={2.5}
            speed={reducedMotion ? 0 : 0.35}
            scale={1}
          />
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-foreground/10" />
        </div>
        <section className="entry-shell-form-column flex min-w-0 items-center justify-center overflow-hidden px-6 py-10 sm:px-10 md:px-12">
          <div
            className={`entry-form w-full max-w-sm${exiting ? ' entry-form--exiting' : ''}`}
          >
            {children}
          </div>
        </section>
      </div>
    </main>
  )
}
