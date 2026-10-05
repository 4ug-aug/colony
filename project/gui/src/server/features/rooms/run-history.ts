import { formatWorkspaceTranscript } from '#project/mcp/workspace'
import type { RoomMessage } from './room-store'

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

/** The task, prefixed with the conversation so far; agents rarely read it themselves. */
export function promptWithHistory(
  where: 'thread' | 'chamber',
  earlier: readonly RoomMessage[],
  task: string,
): string {
  const history = threadHistory(earlier)
  return history.length
    ? `Recent messages in this ${where}, oldest first:\n\n${formatWorkspaceTranscript(history, Date.now())}\n\nYour task, from the latest message:\n${task}`
    : task
}
