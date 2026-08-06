import { useMemo, useState, type AnimationEvent } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Check, Copy, Download, X } from 'lucide-react'
import { Avatar, timestamp } from '#/components/avatar'
import { Markdown } from '#/components/markdown'
import { Button } from '#/components/ui/button'
import { RunCapsule } from '#/features/runs/run-capsule'
import { toast } from '#/components/ui/toast'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { messagesAreGrouped } from './message-grouping'
import type { RoomAttachment, RoomMessage, RoomRun } from './types'
import {
  useAttachmentBlob,
  useEnsureAttachmentObjectUrl,
} from './use-attachment-blob'
import { formatBytes } from './format'

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
            className={long && !expanded ? 'max-h-48 overflow-hidden' : undefined}
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

const previewTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

function AttachmentView({ attachment }: { attachment: RoomAttachment }) {
  const [open, setOpen] = useState(false)
  const preview = previewTypes.has(attachment.contentType)
  const { url } = useAttachmentBlob(attachment.id, preview)
  const ensureAttachmentObjectUrl = useEnsureAttachmentObjectUrl()
  const download = async () => {
    try {
      const objectUrl = await ensureAttachmentObjectUrl(attachment.id)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = attachment.filename
      link.click()
      toast.add({
        title: 'Download started',
        description: attachment.filename,
        type: 'success',
      })
    } catch {
      toast.add({
        title: 'Download failed',
        description: attachment.filename,
        type: 'error',
      })
    }
  }
  if (preview && url)
    return (
      <>
        <div className="relative w-fit max-w-full rounded-lg bg-muted p-2">
          <button
            type="button"
            className="block"
            aria-label={`Preview ${attachment.filename}`}
            onClick={() => setOpen(true)}
          >
            <img
              src={url}
              alt={attachment.filename}
              className="max-h-72 max-w-96 rounded-md border object-contain bg-muted"
            />
          </button>
          <Button
            type="button"
            variant="secondary"
            size="icon-xs"
            className="absolute right-2 bottom-2 shadow-sm cursor-pointer hover:bg-muted"
            aria-label={`Download ${attachment.filename}`}
            onClick={() => void download()}
          >
            <Download />
          </Button>
        </div>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/80 transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0" />
            <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl bg-muted p-3 outline-none transition-opacity duration-200 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0">
              <Dialog.Title className="sr-only">
                {attachment.filename}
              </Dialog.Title>
              <img
                src={url}
                alt={attachment.filename}
                className="max-h-[calc(90vh-1.5rem)] max-w-[calc(95vw-1.5rem)] rounded-lg object-contain"
              />
              <div className="absolute top-3 right-3 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label={`Download ${attachment.filename}`}
                  onClick={() => void download()}
                >
                  <Download />
                </Button>
                <Dialog.Close
                  aria-label="Close image preview"
                  className="inline-flex size-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80"
                >
                  <X className="size-4" />
                </Dialog.Close>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </>
    )
  return (
    <button
      type="button"
      className="flex max-w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-xs hover:bg-muted"
      onClick={() => void download()}
    >
      <span className="truncate">{attachment.filename}</span>
      <span className="shrink-0 text-muted-foreground">
        {formatBytes(attachment.byteSize)}
      </span>
    </button>
  )
}

export function Timeline({
  messages,
  runs,
  openRun,
  mentionHandles,
  currentUserId,
  onEdit,
  focusMessageId,
  onFocusHandled,
}: {
  messages: RoomMessage[]
  runs: RoomRun[]
  openRun: (runId: string) => void
  mentionHandles: string[]
  currentUserId?: string
  onEdit?: (message: RoomMessage) => void
  focusMessageId?: string
  onFocusHandled?: () => void
}) {
  const { data: agents = [] } = useAgentDefinitions()
  const items = useMemo(() => {
    const statuses = new Map(runs.map((run) => [run.triggerMessageId, run]))
    const results = runs
      .filter((run) => run.state === 'succeeded')
      .map((run) => ({
        id: `result-${run.id}`,
        result: run,
        createdAt: run.completedAt ?? run.createdAt,
      }))
    const sorted = [
      ...messages.map((message) => ({
        id: message.id,
        message,
        createdAt: message.createdAt,
      })),
      ...results,
    ].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    const authorId = (item: (typeof sorted)[number]) =>
      'result' in item ? item.result.agentId : item.message.author.id
    return sorted.map((item, index) => {
      const previous = sorted[index - 1]
      return {
        ...item,
        run: 'message' in item ? statuses.get(item.message.id) : undefined,
        grouped: messagesAreGrouped(
          previous
            ? { authorId: authorId(previous), createdAt: previous.createdAt }
            : undefined,
          { authorId: authorId(item), createdAt: item.createdAt },
        ),
      }
    })
  }, [messages, runs])

  if (!items.length)
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No messages yet. Start the conversation.
      </p>
    )
  return (
    <div>
      {items.map((item) => {
        const isResult = 'result' in item
        const author =
          'result' in item
            ? {
                id: item.result.agentId,
                name: agentNameFrom(agents, item.result.agentId),
              }
            : item.message.author
        const text =
          'result' in item
            ? (item.result.output ?? item.result.stdout) || 'Completed.'
            : item.message.text
        const isAgent =
          isResult || (!isResult && item.message.author.kind === 'agent')
        const canEdit =
          !isResult &&
          Boolean(onEdit) &&
          item.message.author.kind !== 'agent' &&
          item.message.author.id === currentUserId
        return (
          <article
            className={`group flex gap-3 ${item.grouped ? 'mt-1' : 'mt-5 first:mt-0'}${
              !isResult && focusMessageId === item.message.id
                ? ' message-search-hit'
                : ''
            }`}
            key={item.id}
            {...(!isResult
              ? {
                  'data-message-id': item.message.id,
                  onAnimationEnd:
                    focusMessageId === item.message.id
                      ? (event: AnimationEvent<HTMLElement>) => {
                          if (event.animationName !== 'message-search-hit')
                            return
                          onFocusHandled?.()
                        }
                      : undefined,
                }
              : {})}
          >
            {item.grouped ? (
              <div className="w-9 shrink-0" aria-hidden="true" />
            ) : (
              <Avatar author={author} agent={isAgent} />
            )}
            <div className="min-w-0 flex-1">
              {!item.grouped && (
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{author.name}</span>
                  <time className="text-xs text-muted-foreground">
                    {timestamp(item.createdAt)}
                  </time>
                  {!isResult && item.message.editedAt != null && (
                    <span className="text-xs text-muted-foreground">Edited</span>
                  )}
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => onEdit?.(item.message)}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              )}
              {item.grouped && (canEdit || (!isResult && item.message.editedAt != null)) && (
                <div className="mb-0.5 flex items-center gap-2">
                  {!isResult && item.message.editedAt != null && (
                    <span className="text-xs text-muted-foreground">Edited</span>
                  )}
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => onEdit?.(item.message)}
                    >
                      Edit
                    </Button>
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
              {!isResult && item.message.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  {item.message.attachments.map((attachment) => (
                    <AttachmentView
                      attachment={attachment}
                      key={attachment.id}
                    />
                  ))}
                </div>
              )}
              {!isResult && item.run && (
                <RunCapsule run={item.run} openRun={openRun} />
              )}
              {isResult && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="mt-1 -ml-2 text-muted-foreground"
                  onClick={() => openRun(item.result.id)}
                >
                  Activity
                </Button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
