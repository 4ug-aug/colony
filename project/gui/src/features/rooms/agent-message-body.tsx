import { Markdown } from '#/components/markdown'
import { Button } from '#/components/ui/button'
import { useState } from 'react'

const agentMessageClampChars = 520

/** A long agent reply, collapsed behind Show more. */
export function AgentMessageBody({
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
