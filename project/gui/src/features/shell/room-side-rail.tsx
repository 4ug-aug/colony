import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '#/components/ui/sheet'
import { useMediaQuery } from '#/hooks/use-media-query'
import { cn } from '#/lib/utils'
import type { ReactNode } from 'react'

export function RoomSideRail({
  label,
  description,
  className,
  sheetClassName,
  onClose,
  children,
}: {
  label: string
  description: string
  className?: string
  sheetClassName?: string
  onClose: () => void
  children: ReactNode
}) {
  const inline = useMediaQuery('(min-width: 1024px)')

  if (inline)
    return (
      <aside
        className={cn(
          'flex h-full min-h-0 w-[26rem] shrink-0 flex-col border-l',
          className,
        )}
        aria-label={label}
      >
        {children}
      </aside>
    )

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
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
