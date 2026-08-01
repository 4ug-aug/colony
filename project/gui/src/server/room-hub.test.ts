import { expect, test } from 'bun:test'
import { createRoomMessageHub, type RoomEvent } from './room-hub'
import type { RoomMessage, RoomMessageInput, RoomStore } from './room-store'

class FakeStore implements Pick<RoomStore, 'listMessages' | 'createMessage'> {
  messages: RoomMessage[] = []
  listMessages(roomId: string) {
    return this.messages.filter((m) => m.roomId === roomId)
  }
  createMessage(message: RoomMessageInput) {
    this.messages.push({ ...message, attachments: message.attachments ?? [] })
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
  hub.postMessage({ roomId: 'general', author: { kind: 'user', id: 'u1', name: 'Ada' }, text: 'A' })
  hub.postMessage({ roomId: 'other', author: { kind: 'user', id: 'u1', name: 'Ada' }, text: 'B' })
  hub.postMessage({ roomId: 'general', author: { kind: 'agent', id: 'software-engineer', name: 'Software engineer' }, text: 'C' })
  const generalMessages = hub.listMessages('general')
  expect(generalMessages).toHaveLength(2)
  expect(generalMessages[0].text).toBe('A')
  expect(generalMessages[1].text).toBe('C')
  expect(generalMessages[1].author).toEqual({ kind: 'agent', id: 'software-engineer', name: 'Software engineer' })
  expect(hub.listMessages('other')).toHaveLength(1)
})
