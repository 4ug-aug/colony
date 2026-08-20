import colonyMarkSvg from '#/features/agents/colony-mark.svg?raw'
import { cn } from '#/lib/utils'
import { useId } from 'react'
import { agentMarkClass } from './agent-color'

export function AgentMarkGlyph({ className }: { className?: string }) {
  const uid = useId().replaceAll(':', '')
  const html = colonyMarkSvg
    .replaceAll('ant-body-shape', `ant-body-shape-${uid}`)
    .replace('fill: #282522', 'fill: currentColor')
  return (
    <span
      aria-hidden="true"
      className={cn('block shrink-0 [&_svg]:block [&_svg]:size-full', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function AgentMark({
  agentId,
  className,
}: {
  agentId: string
  className?: string
}) {
  return (
    <AgentMarkGlyph
      className={cn('size-6', agentMarkClass(agentId), className)}
    />
  )
}

/** Inline mention: colored glyph + semibold label. */
export function AgentMentionChip({
  agentId,
  label,
  className,
}: {
  agentId: string
  label: string
  className?: string
}) {
  return (
    <span
      data-slot="agent-mention-chip"
      className={cn(
        'inline-flex items-center gap-1 align-middle font-semibold',
        agentMarkClass(agentId),
        className,
      )}
    >
      <AgentMark agentId={agentId} className="size-5" />
      <span>{label}</span>
    </span>
  )
}
