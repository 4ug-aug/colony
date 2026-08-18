import { Dithering } from '@paper-design/shaders-react'
import { useTheme } from '#/components/theme-provider'
import { useMediaQuery } from '#/hooks/use-media-query'

/** Warp dither used as a page/placeholder texture. `speed` 0 is still. */
export function StaticDither({ speed = 0 }: { speed?: number }) {
  const { theme } = useTheme()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.16] dark:opacity-[0.1]"
      aria-hidden="true"
    >
      <Dithering
        className="absolute inset-0"
        width="100%"
        height="100%"
        colorBack={dark ? '#252321' : '#f0efe8'}
        colorFront={dark ? '#dedbd2' : '#282522'}
        shape="warp"
        type="4x4"
        size={2.5}
        scale={1}
        speed={reducedMotion ? 0 : speed}
      />
    </div>
  )
}
