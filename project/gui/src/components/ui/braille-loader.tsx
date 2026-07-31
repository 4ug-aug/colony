import { Loader } from '@dot-loaders/react'
import { cn } from '#/lib/utils.ts'

interface BrailleLoaderProps {
  text: string
  className?: string
  speed?: number
}

export function BrailleLoader({
  text,
  className,
  speed = 0.7,
}: BrailleLoaderProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Loader
        fallbackLabel={text}
        loader="diagonal-swipe"
        renderer="svg-grid"
        rendererOptions={{ cellSize: 4, gap: 1, inactiveOpacity: 0.15 }}
        speed={speed}
      />
      <span>{text}</span>
    </span>
  )
}
