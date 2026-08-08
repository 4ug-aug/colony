import { Loader } from '@dot-loaders/react'
import { cn } from '#/lib/utils.ts'

interface BrailleLoaderProps {
  text: string
  className?: string
  speed?: number
  loader?: string
}

export function BrailleLoader({
  text,
  // Here we should specify a type, with 'diagonal-swipe' being default.
  className,
  speed = 0.7,
  loader = 'diagonal-swipe',
}: BrailleLoaderProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      aria-live="polite"
      aria-label={text}
    >
      <Loader
        fallbackLabel=""
        loader={loader}
        renderer="svg-grid"
        rendererOptions={{ cellSize: 4, gap: 1, inactiveOpacity: 0.15 }}
        speed={speed}
      />
      <span>{text}</span>
    </span>
  )
}
