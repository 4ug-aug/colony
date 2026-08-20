import { migratedDatabase, seedAccounts } from '#/server/test-db'
import { expect, test } from 'bun:test'
import {
  chatFollowUpTask,
  createSqliteChatStore,
  DEFAULT_CHAT_TITLE,
  titleFrom,
} from './chat-store'

test('a Chat is private to its account and titles itself from the first user turn', () => {
  const sqlite = migratedDatabase()
  seedAccounts(sqlite, ['ada', 'bob'])
  const store = createSqliteChatStore(sqlite)
  const chat = store.create({
    id: 'chat-1',
    accountId: 'ada',
    agentDefinitionId: 'antboy',
    createdAt: 10,
  })
  expect(chat).toMatchObject({
    accountId: 'ada',
    agentDefinitionId: 'antboy',
    title: DEFAULT_CHAT_TITLE,
    createdAt: 10,
  })
  expect(store.getForAccount('chat-1', 'bob')).toBeUndefined()
  expect(store.listForAccount('bob')).toEqual([])

  const user = store.appendMessage({
    id: 'm1',
    chatId: 'chat-1',
    role: 'user',
    text: 'Who is on call tonight?',
    createdAt: 20,
  })
  expect(user.text).toBe('Who is on call tonight?')
  expect(store.getForAccount('chat-1', 'ada')?.title).toBe(
    'Who is on call tonight?',
  )
  expect(store.getForAccount('chat-1', 'ada')?.updatedAt).toBe(20)

  store.appendMessage({
    id: 'm2',
    chatId: 'chat-1',
    role: 'assistant',
    text: 'Ada is on call.',
    createdAt: 30,
    runId: 'run-1',
    steps: [
      {
        id: 's1',
        idx: 0,
        kind: 'tool_call',
        tool: 'shell',
        text: '{}',
        createdAt: 29,
      },
    ],
  })
  const messages = store.listMessages('chat-1')
  expect(messages).toHaveLength(2)
  expect(messages[1]).toMatchObject({
    role: 'assistant',
    runId: 'run-1',
    steps: [{ tool: 'shell', kind: 'tool_call' }],
  })
  expect(store.getForAccount('chat-1', 'ada')?.title).toBe(
    'Who is on call tonight?',
  )

  expect(store.deleteForAccount('chat-1', 'bob')).toBe(false)
  expect(store.deleteForAccount('chat-1', 'ada')).toBe(true)
  expect(store.getForAccount('chat-1', 'ada')).toBeUndefined()
  sqlite.close()
})

test('titleFrom uses the first line and chatFollowUpTask rehydrates prior turns', () => {
  expect(titleFrom('  hello\nworld  ')).toBe('hello')
  expect(titleFrom('')).toBe(DEFAULT_CHAT_TITLE)
  expect(
    chatFollowUpTask(
      [
        {
          id: 'm1',
          chatId: 'c',
          role: 'user',
          text: 'hi',
          createdAt: 1,
          steps: [],
        },
        {
          id: 'm2',
          chatId: 'c',
          role: 'assistant',
          text: 'hello',
          createdAt: 2,
          steps: [],
        },
      ],
      'again',
    ),
  ).toBe(
    'The previous conversation in this Chat:\n\nUser: hi\n\nAssistant: hello\n\nContinue from that context. The next user message is:\n\nagain',
  )
  expect(chatFollowUpTask([], 'first')).toBe('first')
})
