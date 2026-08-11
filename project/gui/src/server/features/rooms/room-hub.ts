import type {
  RoomMessage,
  RoomStore,
  MessageAuthor,
  NewRoomAttachment,
} from './room-store'

export type RoomEvent =
  | { type: 'message.created'; message: RoomMessage }
  | { type: 'message.updated'; message: RoomMessage }

export type EditMessageFailure = 'not_found' | 'forbidden' | 'empty'

export class EditMessageError extends Error {
  readonly code: EditMessageFailure
  constructor(code: EditMessageFailure) {
    super(code)
    this.name = 'EditMessageError'
    this.code = code
  }
}

export type PostMessageFailure = 'invalid_root'

export class PostMessageError extends Error {
  readonly code: PostMessageFailure
  constructor(code: PostMessageFailure) {
    super(code)
    this.name = 'PostMessageError'
    this.code = code
  }
}

export interface RoomMessageHub {
  listMessages(roomId: string): RoomMessage[]
  /** Complete root plus chronological replies for a thread-scoped read. */
  listThreadMessages(roomId: string, rootId: string): RoomMessage[]
  postMessage(input: {
    roomId: string
    author: MessageAuthor
    text: string
    attachments?: NewRoomAttachment[]
    /** Links this message to a top-level root as a thread reply. */
    rootId?: string
  }): RoomMessage
  editMessage(input: {
    roomId: string
    messageId: string
    authorId: string
    text: string
  }): RoomMessage
  subscribe(listener: (event: RoomEvent) => void): () => void
}

export function createRoomMessageHub(
  store: Pick<
    RoomStore,
    | 'listMessages'
    | 'createMessage'
    | 'getMessage'
    | 'updateMessageText'
    | 'canReplyTo'
    | 'getThread'
  >,
  options?: { createId?: () => string; now?: () => number },
): RoomMessageHub {
  const createId = options?.createId ?? (() => crypto.randomUUID())
  const now = options?.now ?? (() => Date.now())
  const listeners = new Set<(event: RoomEvent) => void>()
  const emit = (event: RoomEvent) => {
    for (const listener of listeners) listener(event)
  }

  return {
    listMessages(roomId) {
      return store.listMessages(roomId)
    },
    listThreadMessages(roomId, rootId) {
      const thread = store.getThread(roomId, rootId)
      if (!thread) return []
      return [thread.root, ...thread.replies]
    },
    postMessage({ roomId, author, text, attachments = [], rootId }) {
      if (rootId != null && !store.canReplyTo(roomId, rootId))
        throw new PostMessageError('invalid_root')
      const message: RoomMessage = {
        id: createId(),
        roomId,
        author,
        text,
        createdAt: now(),
        attachments: attachments.map(
          ({ sha256, storageKey, createdAt, ...attachment }) => attachment,
        ),
        ...(rootId != null ? { rootId } : {}),
      }
      store.createMessage(message, attachments)
      emit({ type: 'message.created', message })
      return message
    },
    editMessage({ roomId, messageId, authorId, text }) {
      const trimmed = text.trim()
      if (!trimmed) throw new EditMessageError('empty')
      const existing = store.getMessage(roomId, messageId)
      if (!existing) throw new EditMessageError('not_found')
      if (existing.author.kind !== 'user' || existing.author.id !== authorId)
        throw new EditMessageError('forbidden')
      if (existing.text === trimmed) return existing
      const updated = store.updateMessageText({
        id: messageId,
        roomId,
        text: trimmed,
        editedAt: now(),
      })
      if (!updated) throw new EditMessageError('not_found')
      emit({ type: 'message.updated', message: updated })
      return updated
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
