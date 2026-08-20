import type { Author } from '#/features/rooms/types'
import { AgentMark } from '#/features/agents/agent-mark'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '#/components/ui/hover-card'
import { accountFaceStyle, accountInitials } from '#/lib/account-color'

// The ant PNG is black with transparency; this CSS mask keeps its silhouette
// while letting the surrounding text colour recolour it per avatar context.
export function AgentAnt({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`agent-ant ${className}`} />
}

export function AccountFace({
  name,
  image,
  color,
  className = 'mt-0.5 size-9 text-sm',
  title,
}: {
  name: string
  image?: string
  color?: string
  className?: string
  title?: string
}) {
  if (image)
    return (
      <img
        className={`shrink-0 rounded-full object-cover ${className}`}
        src={image}
        alt=""
        title={title}
      />
    )
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`}
      style={accountFaceStyle(name, color)}
      aria-hidden="true"
      title={title}
    >
      {accountInitials(name)}
    </div>
  )
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
  const avatar = agent ? (
    <AgentMark agentId={author.id} className="mt-0.5 size-8" />
  ) : (
    <AccountFace name={author.name} image={author.image} color={author.color} />
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
