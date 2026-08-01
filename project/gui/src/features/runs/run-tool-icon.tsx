import {
  MessageSquarePlus,
  MessagesSquare,
  SquareTerminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

const TOOL_ICONS: Record<string, LucideIcon> = {
  shell: SquareTerminal,
  workspace_read_messages: MessagesSquare,
  workspace_post_message: MessageSquarePlus,
}

export function getToolIcon(tool?: string): LucideIcon {
  return (tool && TOOL_ICONS[tool]) || Wrench
}

export function ToolIcon({ tool }: { tool?: string }) {
  const Icon = getToolIcon(tool)
  return (
    <Icon
      aria-hidden="true"
      className="size-3.5 shrink-0 text-muted-foreground"
    />
  )
}
