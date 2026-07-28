import type { Step } from '#/features/runs/step-label'

export type Author = { id: string; name: string; image?: string; kind?: 'user' | 'agent' }
export type Room = { id: string; name: string; visibility: 'public' | 'private'; createdBy?: string }
export type RoomMessage = {
  id: string
  roomId: string
  author: Author
  text: string
  createdAt: number
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
export type StreamMessage =
  | {
      type: 'room.snapshot'
      room: Room
      messages: RoomMessage[]
      runs: RoomRun[]
      latestSteps: Step[]
    }
  | { type: 'room.created'; room: Room }
  | { type: 'message.created'; message: RoomMessage }
  | { type: 'run.changed'; run: RoomRun }
  | { type: 'run.step'; runId: string; step: Step }
  | { type: 'room.removed'; roomId: string }
  | { type: 'room.members.changed'; roomId: string }
