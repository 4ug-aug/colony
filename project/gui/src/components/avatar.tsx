import { Bot } from 'lucide-react'
import type { Author } from '#/features/rooms/types'

export function Avatar({
  author,
  agent = false,
}: {
  author: Author
  agent?: boolean
}) {
  if (author.image)
    return (
      <img
        className="mt-0.5 size-9 shrink-0 rounded-full object-cover"
        src={author.image}
        alt=""
      />
    )
  return (
    <div
      className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        agent ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
      }`}
      aria-hidden="true"
    >
      {agent ? (
        <Bot className="size-4" />
      ) : (
        author.name.slice(0, 1).toUpperCase()
      )}
    </div>
  )
}

export function timestamp(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}
