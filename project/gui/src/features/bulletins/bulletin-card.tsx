import { useRef, useState } from 'react'
import { Markdown } from '#/components/markdown'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { cn } from '#/lib/utils'
import { useDraggable } from '@dnd-kit/react'
import { GripVertical, ListChecks, Trash2 } from 'lucide-react'
import { emptyPoll, keepFocus, PollEditor, PollResults } from './bulletin-poll'
import type { Bulletin, Poll } from './types'

const hideScrollbar =
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

export function BulletinCard({
  bulletin,
  editing,
  zIndex,
  currentUserId,
  onBeginEdit,
  onCommit,
  onVote,
  onDelete,
}: {
  bulletin: Bulletin
  editing: boolean
  zIndex: number
  currentUserId: string
  onBeginEdit: () => void
  onCommit: (body: string, poll: Poll | null) => void
  onVote: (options: number[] | null) => void
  onDelete: () => void
}) {
  const { ref, handleRef, isDragging } = useDraggable({
    id: bulletin.id,
    disabled: editing,
  })
  // Poll edits stay local until the card commits, so half-typed options never
  // hit the server (and never trip its two-option minimum).
  const [draftPoll, setDraftPoll] = useState<Poll | null>(bulletin.poll)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const beginEdit = () => {
    setDraftPoll(bulletin.poll)
    onBeginEdit()
  }

  // Add-only: removing a poll is a labelled action inside the editor, so a
  // stray click on an icon button can never discard a poll and its votes.
  const addPoll = () => {
    setDraftPoll(emptyPoll())
    if (!editing) onBeginEdit()
  }

  return (
    <article
      ref={ref}
      className={cn(
        'group absolute max-h-80 w-80 overflow-hidden rounded-md border border-border/80 bg-background/95 shadow-sm backdrop-blur-sm',
        isDragging && 'opacity-90 shadow-md',
        editing && 'ring-2 ring-ring',
      )}
      style={{
        left: `${bulletin.x * 100}%`,
        top: `${bulletin.y * 100}%`,
        zIndex,
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
        {!(editing ? draftPoll : bulletin.poll) && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Add a poll"
            title="Add a poll"
            onMouseDown={keepFocus}
            onClick={(event) => {
              event.stopPropagation()
              addPoll()
            }}
          >
            <ListChecks className="size-3.5" />
          </Button>
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
        <div
          className={cn('max-h-80 overflow-y-auto', hideScrollbar)}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return
            onCommit(bodyRef.current?.value ?? bulletin.body, draftPoll)
          }}
        >
          <Textarea
            autoFocus
            ref={bodyRef}
            defaultValue={bulletin.body}
            className={cn(
              'min-h-28 resize-none overflow-y-auto rounded-none border-0 bg-transparent p-3 pt-9 shadow-none focus-visible:ring-0',
              hideScrollbar,
            )}
            placeholder="Write markdown…"
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
          {draftPoll && (
            <PollEditor
              poll={draftPoll}
              onChange={setDraftPoll}
              onRemove={() => setDraftPoll(null)}
            />
          )}
        </div>
      ) : (
        <div className={cn('max-h-80 overflow-y-auto', hideScrollbar)}>
          <button
            type="button"
            className="block w-full cursor-text p-3 pt-9 text-left"
            onClick={beginEdit}
          >
            {bulletin.body.trim() ? (
              <Markdown>{bulletin.body}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">Empty bulletin</p>
            )}
          </button>
          {bulletin.poll && (
            <PollResults
              poll={bulletin.poll}
              currentUserId={currentUserId}
              onVote={onVote}
            />
          )}
        </div>
      )}
    </article>
  )
}
