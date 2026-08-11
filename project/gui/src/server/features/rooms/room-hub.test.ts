import { expect, test } from 'bun:test'
import {
  createRoomMessageHub,
  EditMessageError,
  PostMessageError,
  type RoomEvent,
} from './room-hub'
import type { RoomMessage, RoomMessageInput, RoomStore } from './room-store'

class FakeStore implements Pick<
  RoomStore,
  | 'listMessages'
  | 'createMessage'
  | 'getMessage'
  | 'updateMessageText'
  | 'canReplyTo'
  | 'getThread'
> {
  messages: RoomMessage[] = []
  listMessages(roomId: string) {
    return this.messages.filter((m) => m.roomId === roomId && m.rootId == null)
  }
  getMessage(roomId: string, messageId: string) {
    return this.messages.find((m) => m.roomId === roomId && m.id === messageId)
  }
  canReplyTo(roomId: string, rootId: string) {
    return this.messages.some(
      (m) => m.roomId === roomId && m.id === rootId && m.rootId == null,
    )
  }
  getThread(roomId: string, rootId: string) {
    const root = this.messages.find(
      (m) => m.roomId === roomId && m.id === rootId && m.rootId == null,
    )
    if (!root) return undefined
    const replies = this.messages
      .filter((m) => m.roomId === roomId && m.rootId === rootId)
      .sort((a, b) => a.createdAt - b.createdAt)
    return { root, replies, results: [] }
  }
  createMessage(message: RoomMessageInput) {
    this.messages.push({ ...message, attachments: message.attachments ?? [] })
  }
  updateMessageText(input: {
    id: string
    roomId: string
    text: string
    editedAt: number
  }) {
    const index = this.messages.findIndex(
      (m) => m.roomId === input.roomId && m.id === input.id,
    )
    if (index < 0) return undefined
    const updated = {
      ...this.messages[index]!,
      text: input.text,
      editedAt: input.editedAt,
    }
    this.messages[index] = updated
    return updated
  }
}

test('postMessage persists via the store and returns a message with generated id + createdAt', () => {
  const store = new FakeStore()
  let idCounter = 0
  let timeCounter = 1000
  const hub = createRoomMessageHub(store, {
    createId: () => `id-${++idCounter}`,
    now: () => timeCounter++,
  })
  const message = hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Hello',
  })
  expect(message.id).toBe('id-1')
  expect(message.createdAt).toBe(1000)
  expect(message.roomId).toBe('general')
  expect(message.author).toEqual({ kind: 'user', id: 'user-1', name: 'Ada' })
  expect(message.text).toBe('Hello')
  expect(store.messages).toHaveLength(1)
  expect(store.messages[0]).toEqual(message)
})

test('listThreadMessages returns the root plus chronological replies, and an empty list for an unknown root', () => {
  const store = new FakeStore()
  let idCounter = 0
  let timeCounter = 1000
  const hub = createRoomMessageHub(store, {
    createId: () => `id-${++idCounter}`,
    now: () => timeCounter++,
  })
  const root = hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Root question',
  })
  const replyOne = hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-2', name: 'Bo' },
    text: 'First reply',
    rootId: root.id,
  })
  const replyTwo = hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Second reply',
    rootId: root.id,
  })

  expect(hub.listThreadMessages('general', root.id)).toEqual([
    root,
    replyOne,
    replyTwo,
  ])
  expect(hub.listThreadMessages('general', 'unknown-root')).toEqual([])
})

test('subscribers receive the message.created event', () => {
  const store = new FakeStore()
  const hub = createRoomMessageHub(store)
  const received: RoomEvent[] = []
  hub.subscribe((event) => received.push(event))
  const message = hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Hello',
  })
  expect(received).toHaveLength(1)
  expect(received[0]).toEqual({ type: 'message.created', message })
})

test('unsubscribe stops delivery', () => {
  const store = new FakeStore()
  const hub = createRoomMessageHub(store)
  const received: RoomEvent[] = []
  const unsubscribe = hub.subscribe((event) => received.push(event))
  hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'First',
  })
  expect(received).toHaveLength(1)
  unsubscribe()
  hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Second',
  })
  expect(received).toHaveLength(1)
})

test('listMessages delegates to the store', () => {
  const store = new FakeStore()
  const hub = createRoomMessageHub(store)
  hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'u1', name: 'Ada' },
    text: 'A',
  })
  hub.postMessage({
    roomId: 'other',
    author: { kind: 'user', id: 'u1', name: 'Ada' },
    text: 'B',
  })
  hub.postMessage({
    roomId: 'general',
    author: {
      kind: 'agent',
      id: 'software-engineer',
      name: 'Software engineer',
    },
    text: 'C',
  })
  const generalMessages = hub.listMessages('general')
  expect(generalMessages).toHaveLength(2)
  expect(generalMessages[0]!.text).toBe('A')
  expect(generalMessages[1]!.text).toBe('C')
  expect(generalMessages[1]!.author).toEqual({
    kind: 'agent',
    id: 'software-engineer',
    name: 'Software engineer',
  })
  expect(hub.listMessages('other')).toHaveLength(1)
})

test('editMessage updates text, sets editedAt, and emits message.updated', () => {
  const store = new FakeStore()
  let time = 1000
  const hub = createRoomMessageHub(store, {
    createId: () => 'msg-1',
    now: () => time++,
  })
  const received: RoomEvent[] = []
  hub.subscribe((event) => received.push(event))
  hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Hello',
  })
  const updated = hub.editMessage({
    roomId: 'general',
    messageId: 'msg-1',
    authorId: 'user-1',
    text: 'Hello edited',
  })
  expect(updated.text).toBe('Hello edited')
  expect(updated.editedAt).toBe(1001)
  expect(updated.createdAt).toBe(1000)
  expect(store.messages[0]).toEqual(updated)
  expect(received[1]).toEqual({ type: 'message.updated', message: updated })
})

test('editMessage is a no-op when text is unchanged', () => {
  const store = new FakeStore()
  let time = 1000
  const hub = createRoomMessageHub(store, {
    createId: () => 'msg-1',
    now: () => time++,
  })
  const received: RoomEvent[] = []
  hub.subscribe((event) => received.push(event))
  const original = hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Hello',
  })
  const result = hub.editMessage({
    roomId: 'general',
    messageId: 'msg-1',
    authorId: 'user-1',
    text: 'Hello',
  })
  expect(result).toEqual(original)
  expect(result.editedAt).toBeUndefined()
  expect(received).toHaveLength(1)
  expect(time).toBe(1001)
})

test('editMessage rejects empty text, missing messages, and wrong authors', () => {
  const store = new FakeStore()
  let id = 0
  const hub = createRoomMessageHub(store, {
    createId: () => `msg-${++id}`,
  })
  hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Hello',
  })
  hub.postMessage({
    roomId: 'general',
    author: {
      kind: 'agent',
      id: 'software-engineer',
      name: 'Software engineer',
    },
    text: 'Agent says hi',
  })
  try {
    hub.editMessage({
      roomId: 'general',
      messageId: 'msg-1',
      authorId: 'user-1',
      text: '   ',
    })
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(EditMessageError)
    expect((error as EditMessageError).code).toBe('empty')
  }
  try {
    hub.editMessage({
      roomId: 'general',
      messageId: 'missing',
      authorId: 'user-1',
      text: 'Nope',
    })
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(EditMessageError)
    expect((error as EditMessageError).code).toBe('not_found')
  }
  try {
    hub.editMessage({
      roomId: 'general',
      messageId: 'msg-1',
      authorId: 'user-2',
      text: 'Nope',
    })
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(EditMessageError)
    expect((error as EditMessageError).code).toBe('forbidden')
  }
  try {
    hub.editMessage({
      roomId: 'general',
      messageId: 'msg-2',
      authorId: 'software-engineer',
      text: 'Nope',
    })
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(EditMessageError)
    expect((error as EditMessageError).code).toBe('forbidden')
  }
})

test('postMessage accepts a valid rootId and emits a message.created event carrying it', () => {
  const store = new FakeStore()
  let id = 0
  const hub = createRoomMessageHub(store, { createId: () => `msg-${++id}` })
  const received: RoomEvent[] = []
  hub.subscribe((event) => received.push(event))
  const root = hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Root question',
  })
  const reply = hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-2', name: 'Bob' },
    text: 'Reply text',
    rootId: root.id,
  })
  expect(reply.rootId).toBe(root.id)
  expect(hub.listMessages('general')).toEqual([root])
  expect(received[1]).toEqual({ type: 'message.created', message: reply })
})

test('postMessage rejects an invalid, cross-room, or nested rootId', () => {
  const store = new FakeStore()
  let id = 0
  const hub = createRoomMessageHub(store, { createId: () => `msg-${++id}` })
  const root = hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-1', name: 'Ada' },
    text: 'Root question',
  })
  const reply = hub.postMessage({
    roomId: 'general',
    author: { kind: 'user', id: 'user-2', name: 'Bob' },
    text: 'Reply text',
    rootId: root.id,
  })
  try {
    hub.postMessage({
      roomId: 'general',
      author: { kind: 'user', id: 'user-2', name: 'Bob' },
      text: 'Nope',
      rootId: 'missing',
    })
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(PostMessageError)
    expect((error as PostMessageError).code).toBe('invalid_root')
  }
  try {
    hub.postMessage({
      roomId: 'other',
      author: { kind: 'user', id: 'user-2', name: 'Bob' },
      text: 'Nope',
      rootId: root.id,
    })
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(PostMessageError)
    expect((error as PostMessageError).code).toBe('invalid_root')
  }
  try {
    hub.postMessage({
      roomId: 'general',
      author: { kind: 'user', id: 'user-2', name: 'Bob' },
      text: 'Nope',
      rootId: reply.id,
    })
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(PostMessageError)
    expect((error as PostMessageError).code).toBe('invalid_root')
  }
})
