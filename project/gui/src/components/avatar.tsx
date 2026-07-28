import { Bot } from 'lucide-react'
import type { Author } from '#/features/rooms/types'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#/components/ui/hover-card'

export function Avatar({
  author,
  agent = false,
}: {
  author: Author
  agent?: boolean
}) {
  const avatar = author.image ? (
    <img
      className="mt-0.5 size-9 shrink-0 rounded-full object-cover"
      src={author.image}
      alt=""
    />
  ) : (
    <div
      className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        agent ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
      }`}
      aria-hidden="true"
    >
      {agent ? <Bot className="size-4" /> : author.name.slice(0, 1).toUpperCase()}
    </div>
  )
  if (agent || (!author.email && !author.displayName)) return avatar
  return (
    <HoverCard>
      <HoverCardTrigger asChild>{avatar}</HoverCardTrigger>
      <HoverCardContent className="w-56">
        <p className="font-semibold">{author.name}</p>
        {author.displayName && <p className="text-sm">{author.displayName}</p>}
        {author.email && <p className="text-xs text-muted-foreground">{author.email}</p>}
      </HoverCardContent>
    </HoverCard>
  )
}

export function timestamp(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}
