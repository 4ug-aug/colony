import colonyMarkSvg from './colony-mark.svg?raw'
import { cn } from '#/lib/utils'
import type { CSSProperties } from 'react'

/** Colony ant mark. Use this instead of Lucide `Bot`. Keep in sync with `public/colony-mark.svg`. */
export function ColonyMark({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('block shrink-0 [&_svg]:block [&_svg]:size-full', className)}
      style={style}
      dangerouslySetInnerHTML={{ __html: colonyMarkSvg }}
    />
  )
}
