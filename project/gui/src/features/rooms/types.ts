import type { Step } from '#/features/runs/step-label'

export type Author = {
  id: string
  name: string
  image?: string
  email?: string
  displayName?: string
  username?: string
  role?: string
  kind?: 'user' | 'agent'
}
export type Room = {
  id: string
  name: string
  visibility: 'public' | 'private'
  createdBy?: string
  attentionCount: number
  mentionCount: number
  latestOtherMessage?: RoomMessageMarker
}
export type RoomMessageMarker = {
  id: string
  createdAt: number
  authorId: string
}
export type MentionableAccount = {
  id: string
  name: string
  username?: string
  displayName?: string
  image?: string
}
export type ThreadParticipant = {
  id: string
  name: string
}
export type ThreadSummary = {
  replyCount: number
  /** Distinct reply authors, most-recent-first, capped at 3. */
  participants: ThreadParticipant[]
  latestReplyAt: number
}
export type RoomMessage = {
  id: string
  roomId: string
  author: Author
  text: string
  createdAt: number
  editedAt?: number
  attachments: RoomAttachment[]
  /** Set only on thread replies: the id of the top-level message they reply to. */
  rootId?: string
  /** Set only on top-level messages that have durable replies. */
  replySummary?: ThreadSummary
}
/** A successful Room-linked run's final output, presented as a thread reply. */
export type RunResultReply = {
  id: string
  agentId: string
  text: string
  createdAt: number
}
export type RoomThread = {
  root: RoomMessage
  replies: RoomMessage[]
  /** Successful run results rooted at this thread, chronological, counted as replies. */
  results: RunResultReply[]
}
export type RoomAttachment = {
  id: string
  filename: string
  contentType: string
  byteSize: number
}
export type RoomRun = {
  id: string
  roomId: string
  triggerMessageId: string
  requestedBy: Author
  task: string
  agentId: string
  provider: 'openai' | 'custom' | 'cursor'
  model: string
  state: 'preparing' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
  stdout: string
  output?: string
}
export type RoomHistoryPage = {
  messages: RoomMessage[]
  runs: RoomRun[]
  nextCursor?: string
}
export type MessageSearchHit = {
  messageId: string
  roomId: string
  roomName: string
  author: Author
  text: string
  createdAt: number
  /** Set only when the hit is a thread reply: the id of its top-level root message. */
  rootId?: string
}
export type RoomStreamMessage =
  | {
      type: 'room.snapshot'
      room: Room
      messages: RoomMessage[]
      runs: RoomRun[]
      nextCursor?: string
      latestSteps: Step[]
    }
  | { type: 'message.created'; message: RoomMessage }
  | { type: 'message.updated'; message: RoomMessage }
  | { type: 'run.changed'; run: RoomRun }
  | { type: 'run.step'; runId: string; step: Step }
  | { type: 'room.members.changed'; roomId: string }
export type WorkspaceStreamMessage =
  | { type: 'workspace.snapshot'; rooms: Room[] }
  | { type: 'room.created'; room: Room }
  | { type: 'room.removed'; roomId: string }
  | {
      type: 'attention.changed'
      roomId: string
      roomName: string
      attentionCount: number
      mentionCount: number
      kind?: 'mention' | 'run_terminal' | 'thread_reply'
      /** Root message id, present for Thread Attention so clients can open the right rail. */
      rootId?: string
    }
  | {
      type: 'message.created'
      roomId: string
      messageId: string
      createdAt: number
      authorId: string
    }
