import type { StepKind } from '#project/runs'
import type { Sqlite } from '#/server/sqlite'

export const DEFAULT_CHAT_TITLE = 'New chat'
const titleLimit = 72

export type ChatRole = 'user' | 'assistant'

export type Chat = {
  id: string
  accountId: string
  agentDefinitionId: string
  title: string
  createdAt: number
  updatedAt: number
}

export type ChatMessageStep = {
  id: string
  idx: number
  kind: StepKind
  tool?: string
  callId?: string
  text: string
  createdAt: number
}

export type ChatMessage = {
  id: string
  chatId: string
  role: ChatRole
  text: string
  createdAt: number
  runId?: string
  steps: ChatMessageStep[]
}

export type NewChat = {
  id: string
  accountId: string
  agentDefinitionId: string
  createdAt: number
}

export type NewChatMessage = {
  id: string
  chatId: string
  role: ChatRole
  text: string
  createdAt: number
  runId?: string
  steps?: ChatMessageStep[]
}

export interface ChatStore {
  listForAccount(accountId: string): Chat[]
  getForAccount(id: string, accountId: string): Chat | undefined
  listMessages(chatId: string): ChatMessage[]
  create(chat: NewChat): Chat
  appendMessage(message: NewChatMessage): ChatMessage
  deleteForAccount(id: string, accountId: string): boolean
}

type ChatRow = {
  id: string
  account_id: string
  agent_definition_id: string
  title: string
  created_at: number
  updated_at: number
}

type MessageRow = {
  id: string
  chat_id: string
  role: ChatRole
  text: string
  created_at: number
  run_id: string | null
}

type StepRow = {
  id: string
  message_id: string
  idx: number
  kind: StepKind
  tool: string | null
  call_id: string | null
  text: string
  created_at: number
}

const mapChat = (row: ChatRow): Chat => ({
  id: row.id,
  accountId: row.account_id,
  agentDefinitionId: row.agent_definition_id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapStep = (row: StepRow): ChatMessageStep => ({
  id: row.id,
  idx: row.idx,
  kind: row.kind,
  ...(row.tool ? { tool: row.tool } : {}),
  ...(row.call_id ? { callId: row.call_id } : {}),
  text: row.text,
  createdAt: row.created_at,
})

export function titleFrom(text: string): string {
  const line = text.trim().split('\n', 1)[0] ?? ''
  if (!line) return DEFAULT_CHAT_TITLE
  return line.length <= titleLimit ? line : `${line.slice(0, titleLimit - 1)}…`
}

export function chatFollowUpTask(
  prior: readonly ChatMessage[],
  text: string,
): string {
  if (!prior.length) return text
  const transcript = prior
    .map(
      (message) =>
        `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.text}`,
    )
    .join('\n\n')
  return `The previous conversation in this Chat:\n\n${transcript}\n\nContinue from that context. The next user message is:\n\n${text}`
}

export function createSqliteChatStore(sqlite: Sqlite): ChatStore {
  const selectChat = sqlite.prepare(
    `SELECT id, account_id, agent_definition_id, title, created_at, updated_at
     FROM chat WHERE id = ? AND account_id = ?`,
  )
  const selectMessages = sqlite.prepare(
    `SELECT id, chat_id, role, text, created_at, run_id
     FROM chat_message WHERE chat_id = ? ORDER BY created_at, id`,
  )
  const selectSteps = sqlite.prepare(
    `SELECT id, message_id, idx, kind, tool, call_id, text, created_at
     FROM chat_message_step WHERE message_id = ? ORDER BY idx`,
  )

  const getOwned = (id: string, accountId: string) => {
    const row = selectChat.get(id, accountId) as ChatRow | undefined
    return row ? mapChat(row) : undefined
  }

  const messagesFor = (chatId: string): ChatMessage[] => {
    const rows = selectMessages.all(chatId) as MessageRow[]
    return rows.map((row) => ({
      id: row.id,
      chatId: row.chat_id,
      role: row.role,
      text: row.text,
      createdAt: row.created_at,
      ...(row.run_id ? { runId: row.run_id } : {}),
      steps: (selectSteps.all(row.id) as StepRow[]).map(mapStep),
    }))
  }

  return {
    listForAccount: (accountId) =>
      (
        sqlite
          .prepare(
            `SELECT id, account_id, agent_definition_id, title, created_at, updated_at
             FROM chat WHERE account_id = ? ORDER BY updated_at DESC, id DESC`,
          )
          .all(accountId) as ChatRow[]
      ).map(mapChat),
    getForAccount: getOwned,
    listMessages: messagesFor,
    create: (chat) => {
      sqlite
        .prepare(
          `INSERT INTO chat (id, account_id, agent_definition_id, title, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          chat.id,
          chat.accountId,
          chat.agentDefinitionId,
          DEFAULT_CHAT_TITLE,
          chat.createdAt,
          chat.createdAt,
        )
      const created = getOwned(chat.id, chat.accountId)
      if (!created) throw new Error('Failed to create chat')
      return created
    },
    appendMessage: (message) => {
      const chat = sqlite
        .prepare(
          `SELECT id, account_id, agent_definition_id, title, created_at, updated_at
           FROM chat WHERE id = ?`,
        )
        .get(message.chatId) as ChatRow | undefined
      if (!chat) throw new Error('Unknown chat')
      sqlite
        .prepare(
          `INSERT INTO chat_message (id, chat_id, role, text, created_at, run_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          message.id,
          message.chatId,
          message.role,
          message.text,
          message.createdAt,
          message.runId ?? null,
        )
      for (const step of message.steps ?? []) {
        sqlite
          .prepare(
            `INSERT INTO chat_message_step
             (id, message_id, idx, kind, tool, call_id, text, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            step.id,
            message.id,
            step.idx,
            step.kind,
            step.tool ?? null,
            step.callId ?? null,
            step.text,
            step.createdAt,
          )
      }
      const title =
        message.role === 'user' && chat.title === DEFAULT_CHAT_TITLE
          ? titleFrom(message.text)
          : chat.title
      sqlite
        .prepare(`UPDATE chat SET title = ?, updated_at = ? WHERE id = ?`)
        .run(title, message.createdAt, message.chatId)
      const stored = messagesFor(message.chatId).find(
        (entry) => entry.id === message.id,
      )
      if (!stored) throw new Error('Failed to append chat message')
      return stored
    },
    deleteForAccount: (id, accountId) =>
      ((
        sqlite
          .prepare('DELETE FROM chat WHERE id = ? AND account_id = ?')
          .run(id, accountId) as { changes?: number }
      ).changes ?? 0) > 0,
  }
}
