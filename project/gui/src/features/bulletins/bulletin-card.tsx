import { GripVertical, Trash2 } from 'lucide-react'
import { useDraggable } from '@dnd-kit/react'
import { Markdown } from '#/components/markdown'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { cn } from '#/lib/utils'
import type { Bulletin } from './types'

const hideScrollbar =
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

export function BulletinCard({
  bulletin,
  editing,
  zIndex,
  onBeginEdit,
  onCommitBody,
  onDelete,
}: {
  bulletin: Bulletin
  editing: boolean
  zIndex: number
  onBeginEdit: () => void
  onCommitBody: (body: string) => void
  onDelete: () => void
}) {
  const { ref, handleRef, isDragging } = useDraggable({
    id: bulletin.id,
    disabled: editing,
  })

  return (
    <article
      ref={ref}
      className={cn(
        'group absolute max-h-80 w-60 overflow-hidden rounded-md border border-border/80 bg-background/95 shadow-sm backdrop-blur-sm',
        isDragging && 'opacity-90 shadow-md',
        editing && 'ring-2 ring-ring',
      )}
      style={{
        left: `${bulletin.x * 100}%`,
        top: `${bulletin.y * 100}%`,
        zIndex,
        width: 240,
      }}
    >
      <div
        className={cn(
          'absolute right-1 top-1 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100',
          isDragging && 'opacity-100',
        )}
      >
        {!editing && (
          <button
            type="button"
            ref={handleRef}
            className="inline-flex size-7 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
            aria-label="Drag bulletin"
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete bulletin"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {editing ? (
        <Textarea
          autoFocus
          defaultValue={bulletin.body}
          className={cn(
            'max-h-80 min-h-28 resize-none overflow-y-auto rounded-none border-0 bg-transparent p-3 pt-9 shadow-none focus-visible:ring-0',
            hideScrollbar,
          )}
          placeholder="Write markdown…"
          onBlur={(event) => onCommitBody(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.currentTarget.blur()
            }
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
        />
      ) : (
        <div className={cn('max-h-80 overflow-y-auto', hideScrollbar)}>
          <button
            type="button"
            className="block w-full cursor-text p-3 pt-9 text-left"
            onClick={onBeginEdit}
          >
            {bulletin.body.trim() ? (
              <Markdown>{bulletin.body}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">Empty bulletin</p>
            )}
          </button>
        </div>
      )}
    </article>
  )
}
