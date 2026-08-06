import { cn } from '#/lib/utils'

const LABEL_DOT_COLORS = [
  'bg-teal-500',
  'bg-red-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-amber-600',
  'bg-blue-400',
  'bg-orange-500',
  'bg-yellow-500',
  'bg-emerald-500',
  'bg-cyan-400',
  'bg-zinc-400',
] as const

export function labelDotClass(tag: string): string {
  let hash = 0
  for (let index = 0; index < tag.length; index++)
    hash = (hash * 31 + tag.charCodeAt(index)) | 0
  return LABEL_DOT_COLORS[Math.abs(hash) % LABEL_DOT_COLORS.length]!
}

export function LabelDot({
  tag,
  className,
}: {
  tag: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'size-2.5 shrink-0 rounded-full',
        labelDotClass(tag),
        className,
      )}
      aria-hidden
    />
  )
}
