import { cn } from '#/lib/utils'

const LABEL_PALETTE = [
  {
    dot: 'bg-teal-500',
    chip: 'bg-teal-500/20 text-teal-700 dark:bg-teal-500/25 dark:text-teal-300',
  },
  {
    dot: 'bg-red-500',
    chip: 'bg-red-500/20 text-red-700 dark:bg-red-500/25 dark:text-red-300',
  },
  {
    dot: 'bg-sky-500',
    chip: 'bg-sky-500/20 text-sky-700 dark:bg-sky-500/25 dark:text-sky-300',
  },
  {
    dot: 'bg-violet-500',
    chip: 'bg-violet-500/20 text-violet-700 dark:bg-violet-500/25 dark:text-violet-300',
  },
  {
    dot: 'bg-amber-600',
    chip: 'bg-amber-500/20 text-amber-800 dark:bg-amber-500/25 dark:text-amber-300',
  },
  {
    dot: 'bg-blue-400',
    chip: 'bg-blue-500/20 text-blue-700 dark:bg-blue-500/25 dark:text-blue-300',
  },
  {
    dot: 'bg-orange-500',
    chip: 'bg-orange-500/20 text-orange-800 dark:bg-orange-500/25 dark:text-orange-300',
  },
  {
    dot: 'bg-yellow-500',
    chip: 'bg-yellow-500/25 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-200',
  },
  {
    dot: 'bg-green-500',
    chip: 'bg-green-500/20 text-green-700 dark:bg-green-500/25 dark:text-green-300',
  },
  {
    dot: 'bg-cyan-400',
    chip: 'bg-cyan-500/20 text-cyan-700 dark:bg-cyan-500/25 dark:text-cyan-300',
  },
  {
    dot: 'bg-zinc-400',
    chip: 'bg-zinc-500/20 text-zinc-700 dark:bg-zinc-400/20 dark:text-zinc-300',
  },
] as const

function labelPalette(tag: string) {
  let hash = 0
  for (let index = 0; index < tag.length; index++)
    hash = (hash * 31 + tag.charCodeAt(index)) | 0
  return LABEL_PALETTE[Math.abs(hash) % LABEL_PALETTE.length]!
}

export function labelDotClass(tag: string): string {
  return labelPalette(tag).dot
}

export function labelChipClass(tag: string): string {
  return labelPalette(tag).chip
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

export function IssueLabelChip({
  tag,
  className,
}: {
  tag: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-32 items-center truncate rounded-md px-2 text-xs font-medium',
        labelChipClass(tag),
        className,
      )}
    >
      {tag}
    </span>
  )
}
