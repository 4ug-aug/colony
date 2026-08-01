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
}
export type MentionableAccount = {
  id: string
  name: string
  username?: string
  displayName?: string
  image?: string
}
export type RoomMessage = {
  id: string
  roomId: string
  author: Author
  text: string
  createdAt: number
  attachments: RoomAttachment[]
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
      kind?: 'mention' | 'run_terminal'
    }
