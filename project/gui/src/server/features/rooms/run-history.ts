import { formatWorkspaceTranscript } from '#project/mcp/workspace'
import type { MessageDelivery, RoomMessage } from './room-store'

const HISTORY_MESSAGES = 20
const HISTORY_MESSAGE_CHARS = 4_000
// ponytail: fixed ~10k-token budget; size it from the model's context window if 32k models feel cramped.
const HISTORY_CHARS = 40_000

/**
 * The newest messages a run is handed as history, oldest first.
 * Budgeted, because compaction keeps the task (and so this history) verbatim.
 */
export function threadHistory<Message extends { text: string }>(
  messages: readonly Message[],
): Message[] {
  const kept: Message[] = []
  let budget = HISTORY_CHARS
  for (const message of messages.slice(-HISTORY_MESSAGES).reverse()) {
    const text =
      message.text.length > HISTORY_MESSAGE_CHARS
        ? `${message.text.slice(0, HISTORY_MESSAGE_CHARS)}\n[message truncated: ${message.text.length} chars]`
        : message.text
    if (text.length > budget) break
    budget -= text.length
    kept.unshift({ ...message, text })
  }
  return kept
}

/**
 * How a message reads to an agent: a delivery says which schedule it came
 * from, or which agent asked in a Consultation (ADR 0032).
 */
export function transcriptMessage<
  Message extends {
    author: { id: string; name: string }
    text: string
    delivery?: MessageDelivery
  },
>(message: Message, agentName: (id: string) => string = () => 'another agent'): Message {
  const { delivery, author } = message
  if (delivery?.kind === 'schedule')
    return {
      ...message,
      text: `Schedule "${delivery.name}" ${delivery.state}:\n${message.text}`,
    }
  if (delivery?.kind !== 'consultation') return message
  return {
    ...message,
    text:
      author.id === delivery.askingAgentId
        ? `Consultation from ${author.name}, another agent, asking for this Chamber’s account:\n${message.text}`
        : `Answer to ${agentName(delivery.askingAgentId)}’s Consultation:\n${message.text}`,
  }
}

/** The task, prefixed with the conversation so far; agents rarely read it themselves. */
export function promptWithHistory(
  where: 'thread' | 'chamber',
  earlier: readonly RoomMessage[],
  task: string,
  agentName?: (id: string) => string,
): string {
  const history = threadHistory(
    earlier.map((message) => transcriptMessage(message, agentName)),
  )
  return history.length
    ? `Recent messages in this ${where}, oldest first:\n\n${formatWorkspaceTranscript(history, Date.now())}\n\nYour task, from the latest message:\n${task}`
    : task
}
