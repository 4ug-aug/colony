import { useMemo } from 'react'
import { Avatar, timestamp } from '#/components/avatar'
import { Markdown } from '#/components/markdown'
import { Button } from '#/components/ui/button'
import { RunCapsule } from '#/features/runs/run-capsule'
import { messagesAreGrouped } from './message-grouping'
import type { RoomMessage, RoomRun } from './types'

export function Timeline({
  messages,
  runs,
  openRun,
  mentionHandles,
}: {
  messages: RoomMessage[]
  runs: RoomRun[]
  openRun: (runId: string) => void
  mentionHandles: string[]
}) {
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
      'result' in item ? 'software-engineer' : item.message.author.id
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
            ? { id: 'software-engineer', name: 'Software engineer' }
            : item.message.author
        const text =
          'result' in item
            ? (item.result.output ?? item.result.stdout) || 'Completed.'
            : item.message.text
        const isAgent =
          isResult || (!isResult && item.message.author.kind === 'agent')
        return (
          <article
            className={`flex gap-3 ${item.grouped ? 'mt-1' : 'mt-5 first:mt-0'}`}
            key={item.id}
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
                </div>
              )}
              <div
                className={`${item.grouped ? '' : 'mt-0.5'} text-sm leading-6`}
              >
                <Markdown mentions={mentionHandles}>{text}</Markdown>
              </div>
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
