import type {
  RoomMessage,
  RoomMessageMarker,
  RoomRun,
  RoomSummary,
  RoomUser,
  StoredStep,
} from './features/rooms/room-store'
import type {
  Schedule,
  ScheduleRun,
  ScheduleRunStep,
} from './features/schedules/schedule-store'
import type {
  Issue,
  IssueRun,
  IssueRunStep,
} from './features/issues/issue-store'
import type { Bulletin } from './features/bulletins/bulletin-store'
import type { Doc } from './features/docs/doc-store'
import type { Grill } from './features/grills/grill-store'
import type { GrillLatestStep } from './features/grills/grill-linked-runs'

export type RoomServerMessage =
  | {
      type: 'room.snapshot'
      room: WorkspaceRoom
      messages: RoomMessage[]
      runs: RoomRun[]
      nextCursor?: string
      latestSteps: StoredStep[]
    }
  | { type: 'message.created'; message: RoomMessage }
  | { type: 'message.updated'; message: RoomMessage }
  | { type: 'run.changed'; run: RoomRun }
  | { type: 'run.step'; runId: string; step: StoredStep }
  | { type: 'room.members.changed'; roomId: string }
export type WorkspaceRoom = RoomSummary & {
  attentionCount: number
  mentionCount: number
  latestOtherMessage?: RoomMessageMarker
  /** Unacked Thread Attention roots for the current Account. */
  threadAttentionRootIds?: string[]
}
export type WorkspaceServerMessage =
  | { type: 'workspace.snapshot'; rooms: WorkspaceRoom[] }
  | { type: 'room.created'; room: WorkspaceRoom }
  | { type: 'room.removed'; roomId: string }
  | {
      type: 'attention.changed'
      roomId: string
      roomName: string
      attentionCount: number
      mentionCount: number
      kind?: 'mention' | 'run_terminal' | 'thread_reply'
      /** Root message id, present when kind is 'thread_reply' or a run_terminal fired from a thread. */
      rootId?: string
    }
  | {
      type: 'grill_attention.changed'
      grillId: string
      attentionCount: number
      kind?: 'grill_invite'
    }
  | {
      type: 'message.created'
      roomId: string
      messageId: string
      createdAt: number
      authorId: string
    }
  | { type: 'schedule.created'; schedule: Schedule }
  | { type: 'schedule.changed'; schedule: Schedule }
  | { type: 'schedule_run.created'; run: ScheduleRun }
  | { type: 'schedule_run.changed'; run: ScheduleRun }
  | { type: 'schedule_run.step'; runId: string; step: ScheduleRunStep }
  | { type: 'issue.created'; issue: Issue }
  | { type: 'issue.changed'; issue: Issue }
  | { type: 'issue.deleted'; issueId: string }
  | { type: 'issue_run.created'; run: IssueRun }
  | { type: 'issue_run.changed'; run: IssueRun }
  | { type: 'issue_run.step'; runId: string; step: IssueRunStep }
  | { type: 'bulletin.created'; bulletin: Bulletin }
  | { type: 'bulletin.changed'; bulletin: Bulletin }
  | { type: 'bulletin.moved'; bulletin: Bulletin }
  | { type: 'bulletin.deleted'; bulletinId: string }
  | { type: 'doc.created'; doc: Doc }
  | { type: 'doc.changed'; doc: Doc }
  | { type: 'doc.deleted'; docId: string }
export type GrillLeaseMessage = {
  questionId: string
  presenceId: string
  editor: Pick<RoomUser, 'id' | 'name' | 'image' | 'displayName' | 'color'>
}
export type GrillParticipantMessage = Pick<
  RoomUser,
  'id' | 'name' | 'image' | 'displayName' | 'color'
>
export type GrillServerMessage =
  | {
      type: 'grill.snapshot'
      grill: Grill
      presenceId: string
      leases: GrillLeaseMessage[]
      participants: GrillParticipantMessage[]
      latestStep?: GrillLatestStep
      narration: GrillLatestStep[]
    }
  | {
      type: 'grill.activity.changed'
      linkedRun?: {
        id: string
        task: string
        state: string
        error?: string
        createdAt: number
        agentId?: string
        provider?: string
        model?: string
        turnActive?: boolean
      }
      latestStep?: GrillLatestStep
      narration: GrillLatestStep[]
    }
  | { type: 'grill.changed'; grill: Grill }
  | { type: 'grill.presence.changed'; participants: GrillParticipantMessage[] }
  | {
      type: 'grill.lease.changed'
      questionId: string
      lease?: GrillLeaseMessage
    }
  | {
      type: 'grill.draft.changed'
      questionId: string
      value: string
      presenceId: string
      updatedAt: number
    }
  | {
      type: 'grill.edit.rejected'
      questionId: string
      reason: 'lease-held' | 'lease-required' | 'question-not-found'
    }
  | {
      type: 'grill.run.activity'
      linkedRun: {
        id: string
        task: string
        state: string
        error?: string
        turnActive?: boolean
        exitCode?: number
        agentId: string
        provider: string
        model: string
        createdAt: number
        startedAt?: number
        completedAt?: number
      }
      latestStep?: {
        kind: string
        tool?: string
        text: string
        at: number
      }
    }
export type ServerMessage =
  | RoomServerMessage
  | WorkspaceServerMessage
  | GrillServerMessage

export type AgentDefinitionSummary = {
  id: string
  name: string
  description: string
  kind?: 'cursor' | 'openai-agents'
  icon: string
  includeRepository: boolean
  capabilities: { id: string; name: string; tools: string[] }[]
  skills: { id: string; name: string; description: string }[]
}
