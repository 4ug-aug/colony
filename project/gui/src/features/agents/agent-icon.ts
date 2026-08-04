import { Bot, BotMessageSquare, type LucideIcon } from 'lucide-react'

const icons: Record<string, LucideIcon> = {
  bot: Bot,
  'bot-message-square': BotMessageSquare,
}

export function agentIcon(icon: string | undefined): LucideIcon {
  return (icon && icons[icon]) || Bot
}
