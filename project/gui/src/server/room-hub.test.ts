import { expect, test } from 'bun:test'
import {
  createRoomMessageHub,
  EditMessageError,
  type RoomEvent,
} from './room-hub'
import type { RoomMessage, RoomMessageInput, RoomStore } from './room-store'

class FakeStore
  implements
    Pick<
      RoomStore,
      'listMessages' | 'createMessage' | 'getMessage' | 'updateMessageText'
    >
{
  messages: RoomMessage[] = []
  listMessages(roomId: string) {
    return this.messages.filter((m) => m.roomId === roomId)
  }
  getMessage(roomId: string, messageId: string) {
    return this.messages.find((m) => m.roomId === roomId && m.id === messageId)
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
