import { Avatar } from '#/components/avatar'
import { Markdown } from '#/components/markdown'
import { MessageActionToolbar } from './message-action-toolbar'
import { AttachmentView } from './attachment-view'
import { clockTime } from './format'
import type { Author, RoomAttachment } from './types'
import { memo, useState } from 'react'
import type { AnimationEvent, ReactNode } from 'react'

export const RoomMessageRow = memo(function RoomMessageRow({
  messageId,
  author,
  authorName,
  createdAt,
  edited = false,
  text,
  attachments,
  mentionHandles,
  coarsePointer = false,
  isAgent,
  grouped = false,
  focused = false,
  onFocusHandled,
  onReply,
  onEdit,
  metadata,
  dimmed = false,
  body,
}: {
  messageId: string
  author: Author
  authorName: string
  createdAt: number
  edited?: boolean
  text: string
  attachments: RoomAttachment[]
  mentionHandles: string[]
  coarsePointer?: boolean
  isAgent: boolean
  grouped?: boolean
  focused?: boolean
  onFocusHandled?: () => void
  onReply?: () => void
  onEdit?: () => void
  metadata?: ReactNode
  /** A queued Chamber message, not yet handed to the agent. */
  dimmed?: boolean
  /** Replaces the plain Markdown body, e.g. a delivery card or a clamped agent reply. */
  body?: ReactNode
}) {
  const [actionsOpen, setActionsOpen] = useState(false)
  const postedAt = clockTime(createdAt)
  return (
    <article
      className={`room-message ${grouped ? 'room-message--grouped' : ''}${
        focused ? ' message-search-hit' : ''
      }${dimmed ? ' opacity-60' : ''}`}
      data-message-id={messageId}
      data-actions-open={actionsOpen ? '' : undefined}
      onAnimationEnd={
        focused
          ? (event: AnimationEvent<HTMLElement>) => {
              if (event.animationName !== 'message-search-hit') return
              onFocusHandled?.()
            }
          : undefined
      }
    >
      {grouped ? (
        <div className="room-message-gutter">
          <time
            className="room-message-gutter-time"
            dateTime={new Date(createdAt).toISOString()}
          >
            {postedAt}
          </time>
        </div>
      ) : (
        <Avatar
          author={author}
          agent={isAgent}
          className="room-message-avatar mt-0 size-9 rounded-lg text-xs"
        />
      )}
      <div className="room-message-main">
        {!grouped && (
          <div className="room-message-author">
            <span className="room-message-name">{authorName}</span>
            <time
              className="room-message-time"
              dateTime={new Date(createdAt).toISOString()}
            >
              {postedAt}
            </time>
            {edited && <span className="room-message-edited">Edited</span>}
          </div>
        )}
        <div className="room-message-bubble">
          <div className="room-message-body">
            {body ?? <Markdown mentions={mentionHandles}>{text}</Markdown>}
            {grouped && edited && (
              <span className="room-message-edited">Edited</span>
            )}
          </div>
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {attachments.map((attachment) => (
                <AttachmentView attachment={attachment} key={attachment.id} />
              ))}
            </div>
          )}
          {metadata && <div className="room-message-meta">{metadata}</div>}
        </div>
      </div>
      <MessageActionToolbar
        text={text}
        coarsePointer={coarsePointer}
        onReply={onReply}
        onEdit={onEdit}
        onOpenChange={setActionsOpen}
      />
    </article>
  )
})
