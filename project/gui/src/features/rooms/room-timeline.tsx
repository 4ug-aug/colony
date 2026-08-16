import { Avatar } from '#/components/avatar'
import { timestamp } from './format'
import { Markdown } from '#/components/markdown'
import { Button } from '#/components/ui/button'
import { toast } from '#/components/ui/toast'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { RunCapsule } from '#/features/runs/run-capsule'
import { useMediaQuery } from '#/hooks/use-media-query'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { useMemo, useState, type AnimationEvent } from 'react'
import { AttachmentView } from './attachment-view'
import { buildFlatTimelineItems } from './thread-helpers'
import { ThreadSummaryChip } from './thread-summary-chip'
import type { RoomMessage, RoomRun } from './types'

const agentMessageClampChars = 520

function AgentMessageBody({
  text,
  mentions,
}: {
  text: string
  mentions: string[]
}) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const long = text.length > agentMessageClampChars
  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
      toast.add({ title: 'Copied as markdown', type: 'success' })
    } catch {
      toast.add({ title: 'Copy failed', type: 'error' })
    }
  }
  return (
    <div className="agent-message-frame group/agent relative">
      <div className="agent-message-inner">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-2 right-2 opacity-0 transition-opacity group-hover/agent:opacity-100 focus-visible:opacity-100"
          aria-label="Copy as markdown"
          onClick={() => void copyMarkdown()}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
        <div className="relative">
          <div
            className={
              long && !expanded ? 'max-h-48 overflow-hidden' : undefined
            }
          >
            <Markdown mentions={mentions}>{text}</Markdown>
          </div>
          {long && !expanded && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent dark:from-card"
              aria-hidden
            />
          )}
        </div>
        {long && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="mt-1 -ml-2"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Show less' : 'Show more'}
          </Button>
        )}
      </div>
    </div>
  )
}

export function Timeline({
  messages,
  runs,
  openRun,
  mentionHandles,
  currentUserId,
  onEdit,
  onOpenThread,
  focusMessageId,
  onFocusHandled,
  unreadThreadRootIds = [],
}: {
  messages: RoomMessage[]
  runs: RoomRun[]
  openRun: (runId: string) => void
  mentionHandles: string[]
  currentUserId?: string
  onEdit?: (message: RoomMessage) => void
  onOpenThread?: (rootId: string) => void
  focusMessageId?: string
  onFocusHandled?: () => void
  unreadThreadRootIds?: readonly string[]
}) {
  const { data: agents = [] } = useAgentDefinitions()
  // Hover can't reveal the action on touch layouts, so keep it visible there
  // (matching the tap-accessible message action requirement).
  const touchAccessible = useMediaQuery('(pointer: coarse)')
  const replyActionVisibility = touchAccessible
    ? 'opacity-100'
    : 'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100'
  const items = useMemo(
    () => buildFlatTimelineItems(messages, runs),
    [messages, runs],
  )

  if (!items.length)
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No messages yet. Start the conversation.
      </p>
    )
  return (
    <div>
      {items.map((item) => {
        const author = item.message.author
        const text = item.message.text
        const isAgent = item.message.author.kind === 'agent'
        const canEdit =
          Boolean(onEdit) &&
          item.message.author.kind !== 'agent' &&
          item.message.author.id === currentUserId
        const showEditedLabel = item.message.editedAt != null
        const canReplyInThread = Boolean(onOpenThread)
        return (
          <article
            className={`group -mx-2 flex gap-3 rounded-md px-2 py-1.5 transition-colors dark:hover:bg-muted/40 hover:bg-muted/20 ${item.grouped ? 'mt-1' : 'mt-5 first:mt-0'}${
              focusMessageId === item.message.id ? ' message-search-hit' : ''
            }`}
            key={item.id}
            data-message-id={item.message.id}
            onAnimationEnd={
              focusMessageId === item.message.id
                ? (event: AnimationEvent<HTMLElement>) => {
                    if (event.animationName !== 'message-search-hit') return
                    onFocusHandled?.()
                  }
                : undefined
            }
          >
            {item.grouped ? (
              <div className="w-9 shrink-0" aria-hidden="true" />
            ) : (
              <Avatar author={author} agent={isAgent} />
            )}
            <div className="min-w-0 flex-1">
              {!item.grouped && (
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">
                    {isAgent
                      ? agentNameFrom(agents, author.id)
                      : author.name}
                  </span>
                  <time className="text-xs text-muted-foreground">
                    {timestamp(item.createdAt)}
                  </time>
                  {showEditedLabel && (
                    <span className="text-xs text-muted-foreground">
                      Edited
                    </span>
                  )}
                  {(canReplyInThread || canEdit) && (
                    <span className="ml-auto flex items-center gap-1">
                      {canReplyInThread && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className={replyActionVisibility}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => onOpenThread?.(item.message.id)}
                        >
                          <MessageCircle />
                          Reply in thread
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => onEdit?.(item.message)}
                        >
                          Edit
                        </Button>
                      )}
                    </span>
                  )}
                </div>
              )}
              {item.grouped &&
                (canEdit || showEditedLabel || canReplyInThread) && (
                  <div className="mb-0.5 flex items-center gap-2">
                    {showEditedLabel && (
                      <span className="text-xs text-muted-foreground">
                        Edited
                      </span>
                    )}
                    {(canReplyInThread || canEdit) && (
                      <span className="ml-auto flex items-center gap-1">
                        {canReplyInThread && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className={replyActionVisibility}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => onOpenThread?.(item.message.id)}
                          >
                            <MessageCircle />
                            Reply in thread
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={() => onEdit?.(item.message)}
                          >
                            Edit
                          </Button>
                        )}
                      </span>
                    )}
                  </div>
                )}
              <div
                className={`${item.grouped ? '' : 'mt-0.5'} text-sm leading-6`}
              >
                {isAgent ? (
                  <AgentMessageBody text={text} mentions={mentionHandles} />
                ) : (
                  <Markdown mentions={mentionHandles}>{text}</Markdown>
                )}
              </div>
              {item.message.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  {item.message.attachments.map((attachment) => (
                    <AttachmentView
                      attachment={attachment}
                      key={attachment.id}
                    />
                  ))}
                </div>
              )}
              {(item.run || (item.message.replySummary && onOpenThread)) && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {item.run && (
                    <RunCapsule
                      run={item.run}
                      openRun={openRun}
                      className="mt-0"
                    />
                  )}
                  {item.message.replySummary && onOpenThread && (
                    <ThreadSummaryChip
                      replyCount={item.message.replySummary.replyCount}
                      participants={item.message.replySummary.participants}
                      latestReplyAt={item.message.replySummary.latestReplyAt}
                      unread={unreadThreadRootIds.includes(item.message.id)}
                      onOpen={() => onOpenThread(item.message.id)}
                    />
                  )}
                </div>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
