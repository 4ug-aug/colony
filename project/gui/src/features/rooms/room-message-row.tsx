import { Avatar } from '#/components/avatar'
import { Markdown } from '#/components/markdown'
import { Button } from '#/components/ui/button'
import { MessageActionToolbar } from './message-action-toolbar'
import { AttachmentView } from './attachment-view'
import { clockTime } from './format'
import type { Author, RoomAttachment } from './types'
import { memo, useState } from 'react'
import type { AnimationEvent, ReactNode } from 'react'

const agentMessageClampChars = 520

function AgentMessageBody({
  text,
  mentions,
}: {
  text: string
  mentions: string[]
}) {
  const [expanded, setExpanded] = useState(false)
  const long = text.length > agentMessageClampChars
  return (
    <div>
      <div className="relative">
        <div
          className={long && !expanded ? 'max-h-48 overflow-hidden' : undefined}
        >
          <Markdown mentions={mentions}>{text}</Markdown>
        </div>
        {long && !expanded && (
          <div
            className="room-message-clamp-fade pointer-events-none absolute inset-x-0 bottom-0 h-16"
            aria-hidden
          />
        )}
      </div>
      {long && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-1"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </div>
  )
}

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
  clampAgentBody = false,
  focused = false,
  onFocusHandled,
  onReply,
  onEdit,
  metadata,
  dimmed = false,
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
  clampAgentBody?: boolean
  focused?: boolean
  onFocusHandled?: () => void
  onReply?: () => void
  onEdit?: () => void
  metadata?: ReactNode
  /** A queued Chamber message, not yet handed to the agent. */
  dimmed?: boolean
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
            {isAgent && clampAgentBody ? (
              <AgentMessageBody text={text} mentions={mentionHandles} />
            ) : (
              <Markdown mentions={mentionHandles}>{text}</Markdown>
            )}
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
