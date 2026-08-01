import type {
  RoomMessage,
  RoomStore,
  MessageAuthor,
  NewRoomAttachment,
} from './room-store'

export type RoomEvent = { type: 'message.created'; message: RoomMessage }

export interface RoomMessageHub {
  listMessages(roomId: string): RoomMessage[]
  postMessage(input: {
    roomId: string
    author: MessageAuthor
    text: string
    attachments?: NewRoomAttachment[]
  }): RoomMessage
  subscribe(listener: (event: RoomEvent) => void): () => void
}

export function createRoomMessageHub(
  store: Pick<RoomStore, 'listMessages' | 'createMessage'>,
  options?: { createId?: () => string; now?: () => number },
): RoomMessageHub {
  const createId = options?.createId ?? (() => crypto.randomUUID())
  const now = options?.now ?? (() => Date.now())
  const listeners = new Set<(event: RoomEvent) => void>()

  return {
    listMessages(roomId) {
      return store.listMessages(roomId)
    },
    postMessage({ roomId, author, text, attachments = [] }) {
      const message: RoomMessage = {
        id: createId(),
        roomId,
        author,
        text,
        createdAt: now(),
        attachments: attachments.map(
          ({ sha256, storageKey, createdAt, ...attachment }) => attachment,
        ),
      }
      store.createMessage(message, attachments)
      const event: RoomEvent = { type: 'message.created', message }
      for (const listener of listeners) listener(event)
      return message
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
