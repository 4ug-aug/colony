import type { Author } from '#/features/rooms/types'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '#/components/ui/hover-card'

// The ant PNG is black with transparency; this CSS mask keeps its silhouette
// while letting the surrounding text colour recolour it per avatar context.
export function AgentAnt({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`agent-ant ${className}`} />
}

export function Avatar({
  author,
  agent = false,
  details = true,
}: {
  author: Author
  agent?: boolean
  details?: boolean
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
      {agent ? (
        <AgentAnt className="size-8" />
      ) : (
        author.name.slice(0, 1).toUpperCase()
      )}
    </div>
  )
  if (!details || agent || (!author.email && !author.displayName)) return avatar
  return (
    <HoverCard>
      <HoverCardTrigger render={avatar} />
      <HoverCardContent className="w-56">
        <p className="font-semibold">{author.name}</p>
        {author.displayName && author.displayName !== author.name && (
          <p className="text-sm">{author.displayName}</p>
        )}
        {author.email && (
          <p className="text-xs text-muted-foreground">{author.email}</p>
        )}
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
