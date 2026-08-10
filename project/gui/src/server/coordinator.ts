import type { ServerWebSocket } from 'bun'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  createRunControl,
  type RunControl,
  type RunSummary,
} from './features/runs/run-control'
import {
  createSqliteRoomStore,
  type RoomMessage,
  type RoomMessageMarker,
  type RoomRun,
  type RoomSummary,
  type RoomStore,
  type RoomUser,
  type StoredStep,
} from './features/rooms/room-store'
import { createRoomMessageHub, type RoomMessageHub } from './features/rooms/room-hub'
import {
  createAdmissionHttpHandler,
  type AdmissionOptions,
} from './features/accounts/admission-http'
import { mentionedAccounts } from './features/rooms/attention'
import { rosterDefinitionSummaries, rosterPerson } from '../../../agents/roster'
import {
  attachmentDirectory,
  createRoomAttachmentSource,
} from './features/rooms/attachments'
import {
  createWorkspaceSkillStore,
  skillDirectory,
} from './features/workspace/workspace-skills'
import { createWorkspaceConnections } from './features/workspace/workspace-connections'
import { capabilityPresentation } from '../../../agents/roster-people'
import { getConnectionKind } from '../../../connections/registry'
import {
  createSqliteScheduleStore,
  type Schedule,
  type ScheduleRun,
  type ScheduleRunStep,
  type ScheduleStore,
} from './features/schedules/schedule-store'
import {
  createSqliteIssueStore,
  resolveIssue,
  type Issue,
  type IssueOwner,
  type IssueRun,
  type IssueRunStep,
  type IssueStore,
} from './features/issues/issue-store'
import {
  createSqliteBulletinStore,
  type Bulletin,
  type BulletinStore,
} from './features/bulletins/bulletin-store'
import {
  createSqliteDocStore,
  type Doc,
  type DocStore,
} from './features/docs/doc-store'
import {
  createSqliteGrillStore,
  type Grill,
  type GrillStore,
} from './features/grills/grill-store'
import { createIssueRunner, type IssueRunner } from './features/issues/issue-runner'
import {
  createScheduleRunner,
  type ScheduleRunner,
} from './features/schedules/schedule-runner'
import {
  allowedOrigin,
  json,
  withCors,
} from './http/respond'
import { createIssuesHttp } from './features/issues/issues-http'
import { createSchedulesHttp } from './features/schedules/schedules-http'
import { createBulletinsHttp } from './features/bulletins/bulletins-http'
import { createDocsHttp } from './features/docs/docs-http'
import { createGrillsHttp } from './features/grills/grills-http'
import { createGrillLinkedRuns } from './features/grills/grill-linked-runs'
import { createRoomsHttp } from './features/rooms/rooms-http'
import { createMembersHttp } from './features/rooms/members-http'
import { createOneshotsHttp } from './features/oneshots/oneshots-http'
import { createOneshotSession } from './features/oneshots/oneshot-session'

export { allowedOrigin }

export interface SessionAuthenticator {
  authenticate(request: Request): Promise<RoomUser | undefined>
}

// Short-lived, single-process HMAC ticket used to authenticate the realtime
// WebSocket. The desktop client authenticates over HTTP (cookie jar), fetches a
// ticket, and passes it in the stream URL — the WebSocket transport cannot carry
// the HTTP session, so the ticket bridges an already-authenticated HTTP request
// to the upgrade.
const realtimeTicketSecret = randomBytes(32)
const realtimeTicketTtlMs = 30_000
export const mintRealtimeTicket = (userId: string): string => {
  const body = Buffer.from(
    `${userId}|${Date.now() + realtimeTicketTtlMs}`,
  ).toString('base64url')
  const sig = createHmac('sha256', realtimeTicketSecret)
    .update(body)
    .digest('base64url')
  return `${body}.${sig}`
}
export const verifyRealtimeTicket = (ticket: string): string | undefined => {
  const [body, sig] = ticket.split('.')
  if (!body || !sig) return undefined
  const expected = createHmac('sha256', realtimeTicketSecret)
    .update(body)
    .digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf))
    return undefined
  const [userId, expiry] = Buffer.from(body, 'base64url').toString().split('|')
  if (!userId || !expiry || Date.now() > Number(expiry)) return undefined
  return userId
}

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
      kind?: 'mention' | 'run_terminal'
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
type GrillLeaseMessage = {
  questionId: string
  presenceId: string
  editor: Pick<RoomUser, 'id' | 'name' | 'image' | 'displayName'>
}
type GrillParticipantMessage = Pick<
  RoomUser,
  'id' | 'name' | 'image' | 'displayName'
>
export type GrillServerMessage =
  | {
      type: 'grill.snapshot'
      grill: Grill
      presenceId: string
      leases: GrillLeaseMessage[]
      participants: GrillParticipantMessage[]
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
export type ServerMessage =
  RoomServerMessage | WorkspaceServerMessage | GrillServerMessage

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

const roomHistoryPageSize = 50
const grillLeaseTtlMs = 4_000

type SocketData =
  | { scope: 'room'; roomId: string; userId: string }
  | { scope: 'workspace'; userId: string }
  | {
      scope: 'grill'
      grillId: string
      userId: string
      presenceId: string
      user: RoomUser
    }

const send = (
  socket: ServerWebSocket<SocketData>,
  message: ServerMessage,
): void => {
  socket.send(JSON.stringify(message))
}

export type SandboxProviderName = 'apple-container' | 'docker'

export function parseSandboxProvider(
  value: string | undefined,
): SandboxProviderName {
  if (value === 'apple-container' || value === 'docker') return value
  throw new Error(
    'SWEAT_SANDBOX_PROVIDER must be set to one of: apple-container, docker',
  )
}

export function createCoordinator(options: {
  control: RunControl
  store: RoomStore
  messages: RoomMessageHub
  authenticator: SessionAuthenticator
  authHandler: (request: Request) => Promise<Response>
  origin: string
  attachmentDirectory?: string
  port?: number
  admission?: AdmissionOptions
  agentReady?: (agentDefinitionId?: string) => boolean
  scheduleStore?: ScheduleStore
  issueStore?: IssueStore
  bulletinStore?: BulletinStore
  docStore?: DocStore
  grillStore?: GrillStore
  grillNotify?: {
    onChanged: (grill: Grill) => void
  }
  issueNotify?: {
    onCreated: (issue: Issue) => void
    onChanged: (issue: Issue) => void
    assignOwner: (
      issueId: string,
      owner: IssueOwner | undefined,
    ) => { issue: Issue; run?: IssueRun }
    maybeStartForOwner: (
      issueId: string,
    ) => { issue: Issue; run?: IssueRun }
  }
  agentDefinitions?: () => AgentDefinitionSummary[]
}) {
  const attachmentsDirectory =
    options.attachmentDirectory ??
    attachmentDirectory(process.env.SWEAT_DATABASE_PATH ?? './sweat.sqlite')
  const sockets = new Set<ServerWebSocket<SocketData>>()
  type GrillLease = GrillLeaseMessage & {
    socket: ServerWebSocket<SocketData>
    lastSeen: number
  }
  const grillLeases = new Map<string, Map<string, GrillLease>>()
  const admissionHandler = options.admission
    ? createAdmissionHttpHandler({
        ...options.admission,
        authenticate: (request) => options.authenticator.authenticate(request),
        guiOrigin: options.origin,
        onSuspend: (userId) => {
          for (const socket of sockets)
            if (socket.data.userId === userId)
              socket.close(1008, 'Account suspended')
        },
      })
    : undefined
  const roomsFor = (userId: string): WorkspaceRoom[] => {
    const counts = options.store.listAttentionCounts(userId)
    const mentionCounts = options.store.listAttentionCounts(userId, 'mention')
    return options.store.listRoomsForUser(userId).map((room) => {
      const latestOtherMessage = options.store.latestMessageFromOther(
        room.id,
        userId,
      )
      return {
        ...room,
        attentionCount: counts.get(room.id) ?? 0,
        mentionCount: mentionCounts.get(room.id) ?? 0,
        ...(latestOtherMessage ? { latestOtherMessage } : {}),
      }
    })
  }
  const agentDefinitions = (): AgentDefinitionSummary[] =>
    options.agentDefinitions?.() ?? rosterDefinitionSummaries()
  const broadcastWorkspace = (message: WorkspaceServerMessage): void => {
    for (const socket of sockets)
      if (socket.data.scope === 'workspace') send(socket, message)
  }
  if (options.issueNotify) {
    options.issueNotify.onCreated = (issue) =>
      broadcastWorkspace({ type: 'issue.created', issue })
    options.issueNotify.onChanged = (issue) =>
      broadcastWorkspace({ type: 'issue.changed', issue })
  }
  const broadcastRoom = (roomId: string, message: RoomServerMessage): void => {
    for (const socket of sockets)
      if (socket.data.scope === 'room' && socket.data.roomId === roomId)
        send(socket, message)
  }
  const broadcastGrill = (
    grillId: string,
    message: GrillServerMessage,
  ): void => {
    for (const socket of sockets)
      if (socket.data.scope === 'grill' && socket.data.grillId === grillId)
        send(socket, message)
  }
  const broadcastGrillChanged = (grillId: string, grill: Grill): void =>
    broadcastGrill(grillId, { type: 'grill.changed', grill })
  if (options.grillNotify) {
    options.grillNotify.onChanged = (grill) =>
      broadcastGrillChanged(grill.id, grill)
  }
  const grillParticipants = (grillId: string): GrillParticipantMessage[] => {
    const participants = new Map<string, GrillParticipantMessage>()
    for (const socket of sockets) {
      if (socket.data.scope !== 'grill' || socket.data.grillId !== grillId)
        continue
      const user = socket.data.user
      participants.set(user.id, {
        id: user.id,
        name: user.name,
        ...(user.image ? { image: user.image } : {}),
        ...(user.displayName ? { displayName: user.displayName } : {}),
      })
    }
    return [...participants.values()]
  }
  const broadcastGrillPresence = (grillId: string): void =>
    broadcastGrill(grillId, {
      type: 'grill.presence.changed',
      participants: grillParticipants(grillId),
    })
  const publicLease = ({
    questionId,
    presenceId,
    editor,
  }: GrillLease): GrillLeaseMessage => ({ questionId, presenceId, editor })
  const releaseGrillLease = (grillId: string, questionId: string): void => {
    const leases = grillLeases.get(grillId)
    if (!leases?.delete(questionId)) return
    if (leases.size === 0) grillLeases.delete(grillId)
    broadcastGrill(grillId, { type: 'grill.lease.changed', questionId })
  }
  const expireGrillLeases = (now = Date.now()): void => {
    for (const [grillId, leases] of grillLeases)
      for (const [questionId, lease] of leases)
        if (now - lease.lastSeen >= grillLeaseTtlMs)
          releaseGrillLease(grillId, questionId)
  }
  const releaseSocketGrillLeases = (
    socket: ServerWebSocket<SocketData>,
    exceptQuestionId?: string,
  ): void => {
    if (socket.data.scope !== 'grill') return
    const leases = grillLeases.get(socket.data.grillId)
    if (!leases) return
    for (const [questionId, lease] of leases)
      if (lease.socket === socket && questionId !== exceptQuestionId)
        releaseGrillLease(socket.data.grillId, questionId)
  }
  const hasActiveGrillLeases = (grillId: string): boolean => {
    expireGrillLeases()
    return (grillLeases.get(grillId)?.size ?? 0) > 0
  }
  const broadcastWorkspaceToUsers = (
    userIds: Set<string>,
    message: WorkspaceServerMessage,
  ): void => {
    for (const socket of sockets)
      if (socket.data.scope === 'workspace' && userIds.has(socket.data.userId))
        send(socket, message)
  }
  const broadcastWorkspaceMessage = (message: {
    roomId: string
    messageId: string
    createdAt: number
    authorId: string
  }): void => {
    for (const socket of sockets)
      if (
        socket.data.scope === 'workspace' &&
        socket.data.userId !== message.authorId &&
        options.store.canAccessRoom(message.roomId, socket.data.userId)
      )
        send(socket, { type: 'message.created', ...message })
  }
  let scheduleRunner: ScheduleRunner | undefined
  if (options.scheduleStore) {
    scheduleRunner = createScheduleRunner({
      store: options.scheduleStore,
      control: options.control,
      onScheduleChange: (schedule) =>
        broadcastWorkspace({ type: 'schedule.changed', schedule }),
      onRunCreated: (run) =>
        broadcastWorkspace({ type: 'schedule_run.created', run }),
      onRunChange: (run) =>
        broadcastWorkspace({ type: 'schedule_run.changed', run }),
      onStep: (step) =>
        broadcastWorkspace({
          type: 'schedule_run.step',
          runId: step.runId,
          step,
        }),
    })
  }
  let issueRunner: IssueRunner | undefined
  if (options.issueStore) {
    issueRunner = createIssueRunner({
      store: options.issueStore,
      control: options.control,
      onIssueChange: (issue) =>
        broadcastWorkspace({ type: 'issue.changed', issue }),
      onRunCreated: (run) =>
        broadcastWorkspace({ type: 'issue_run.created', run }),
      onRunChange: (run) =>
        broadcastWorkspace({ type: 'issue_run.changed', run }),
      onStep: (step) =>
        broadcastWorkspace({
          type: 'issue_run.step',
          runId: step.runId,
          step,
        }),
    })
    if (options.issueNotify) {
      options.issueNotify.assignOwner = (issueId, owner) =>
        issueRunner!.assignOwner(issueId, owner)
      options.issueNotify.maybeStartForOwner = (issueId) =>
        issueRunner!.maybeStartForOwner(issueId)
    }
  }
  const oneshotSession = createOneshotSession({ control: options.control })
  const broadcastAttention = (
    userId: string,
    roomId: string,
    kind?: 'mention' | 'run_terminal',
  ): void => {
    const attentionCount =
      options.store.listAttentionCounts(userId).get(roomId) ?? 0
    const mentionCount =
      options.store.listAttentionCounts(userId, 'mention').get(roomId) ?? 0
    broadcastWorkspaceToUsers(new Set([userId]), {
      type: 'attention.changed',
      roomId,
      roomName: options.store.getRoom(roomId)?.name ?? 'Room',
      attentionCount,
      mentionCount,
      ...(kind ? { kind } : {}),
    })
  }
  const broadcastGrillAttention = (userId: string, grillId: string): void => {
    if (!options.grillStore) return
    const attentionCount =
      options.grillStore.listGrillAttentionCounts(userId).get(grillId) ?? 0
    broadcastWorkspaceToUsers(new Set([userId]), {
      type: 'grill_attention.changed',
      grillId,
      attentionCount,
      kind: 'grill_invite',
    })
  }
  const createAttention = (
    roomId: string,
    recipientId: string,
    kind: 'mention' | 'run_terminal',
    sourceId: string,
    createdAt: number,
  ): void => {
    if (
      options.store.createAttention({
        id: crypto.randomUUID(),
        roomId,
        recipientId,
        kind,
        sourceId,
        createdAt,
      })
    )
      broadcastAttention(recipientId, roomId, kind)
  }
  const sendSnapshot = (socket: ServerWebSocket<SocketData>): void => {
    if (socket.data.scope === 'workspace') {
      send(socket, {
        type: 'workspace.snapshot',
        rooms: roomsFor(socket.data.userId),
      })
      return
    }
    if (socket.data.scope === 'grill') {
      const grill = options.grillStore?.getGrillForUser(
        socket.data.grillId,
        socket.data.userId,
      )
      if (!grill) return socket.close()
      expireGrillLeases()
      send(socket, {
        type: 'grill.snapshot',
        grill,
        presenceId: socket.data.presenceId,
        leases: [...(grillLeases.get(socket.data.grillId)?.values() ?? [])].map(
          publicLease,
        ),
        participants: grillParticipants(socket.data.grillId),
      })
      return
    }
    const room = options.store.getRoom(socket.data.roomId)
    if (!room) return socket.close()
    const page = options.store.listRoomHistoryPage(socket.data.roomId, {
      limit: roomHistoryPageSize,
    })
    const roomState = roomsFor(socket.data.userId).find(
      ({ id }) => id === room.id,
    )
    send(socket, {
      type: 'room.snapshot',
      room: {
        ...room,
        attentionCount: roomState?.attentionCount ?? 0,
        mentionCount: roomState?.mentionCount ?? 0,
        ...(roomState?.latestOtherMessage
          ? { latestOtherMessage: roomState.latestOtherMessage }
          : {}),
      },
      messages: page.messages,
      runs: page.runs,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      latestSteps: [
        ...options.store.latestStepsForActiveRuns(socket.data.roomId).values(),
      ],
    })
  }
  const handleGrillMessage = (
    socket: ServerWebSocket<SocketData>,
    raw: string,
  ): void => {
    if (socket.data.scope !== 'grill' || !options.grillStore) return
    let input: Record<string, unknown>
    try {
      input = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    const questionId = input.questionId
    if (typeof questionId !== 'string' || !questionId) return
    const { grillId } = socket.data
    const grill = options.grillStore.getGrillForUser(
      grillId,
      socket.data.userId,
    )
    if (!grill) return socket.close()
    if (!grill.frontier.questions.some(({ id }) => id === questionId)) {
      send(socket, {
        type: 'grill.edit.rejected',
        questionId,
        reason: 'question-not-found',
      })
      return
    }
    expireGrillLeases()
    const leases = grillLeases.get(grillId) ?? new Map<string, GrillLease>()
    const current = leases.get(questionId)

    if (input.type === 'grill.focus') {
      releaseSocketGrillLeases(socket, questionId)
      if (current && current.socket !== socket) {
        send(socket, {
          type: 'grill.lease.changed',
          questionId,
          lease: publicLease(current),
        })
        return
      }
      const user = socket.data.user
      const lease: GrillLease = {
        questionId,
        presenceId: socket.data.presenceId,
        editor: {
          id: user.id,
          name: user.name,
          ...(user.image ? { image: user.image } : {}),
          ...(user.displayName ? { displayName: user.displayName } : {}),
        },
        socket,
        lastSeen: Date.now(),
      }
      leases.set(questionId, lease)
      grillLeases.set(grillId, leases)
      broadcastGrill(grillId, {
        type: 'grill.lease.changed',
        questionId,
        lease: publicLease(lease),
      })
      return
    }

    if (input.type === 'grill.blur') {
      if (current?.socket === socket) releaseGrillLease(grillId, questionId)
      return
    }

    if (input.type === 'grill.heartbeat') {
      if (current?.socket === socket) current.lastSeen = Date.now()
      return
    }

    if (input.type !== 'grill.draft' || typeof input.value !== 'string') return
    if (current?.socket !== socket) {
      send(socket, {
        type: 'grill.edit.rejected',
        questionId,
        reason: current ? 'lease-held' : 'lease-required',
      })
      return
    }
    current.lastSeen = Date.now()
    const updated = options.grillStore.updateDrafts(
      grillId,
      { [questionId]: input.value },
      Date.now(),
    )
    if (!updated) return
    broadcastGrill(grillId, {
      type: 'grill.draft.changed',
      questionId,
      value: input.value,
      presenceId: socket.data.presenceId,
      updatedAt: updated.updatedAt,
    })
  }
  const notifyRunTerminal = (run: RoomRun): void => {
    const eligible = new Set(
      options.store.listMentionableAccounts(run.roomId).map(({ id }) => id),
    )
    const recipients = new Set([
      run.requestedBy.id,
      ...options.store.listMentionRecipientIds(run.triggerMessageId),
    ])
    for (const recipientId of recipients)
      if (eligible.has(recipientId))
        createAttention(
          run.roomId,
          recipientId,
          'run_terminal',
          run.id,
          run.completedAt ?? Date.now(),
        )
  }
  const project = (run: RunSummary): void => {
    const saved = options.store.getRun(run.id)
    if (!saved) return
    const changed = { ...saved, ...run }
    options.store.updateRun(changed)
    broadcastRoom(changed.roomId, { type: 'run.changed', run: changed })
    if (
      changed.state === 'succeeded' ||
      changed.state === 'failed' ||
      changed.state === 'cancelled'
    )
      notifyRunTerminal(changed)
  }
  const unsubscribe = options.control.subscribe(project)
  const unsubscribeMessages = options.messages.subscribe((event) => {
    broadcastRoom(event.message.roomId, event)
    if (event.type !== 'message.created') return
    for (const account of mentionedAccounts(
      event.message.text,
      options.store.listMentionableAccounts(event.message.roomId),
    )) {
      if (
        event.message.author.kind === 'user' &&
        event.message.author.id === account.id
      )
        continue
      createAttention(
        event.message.roomId,
        account.id,
        'mention',
        event.message.id,
        event.message.createdAt,
      )
    }
    broadcastWorkspaceMessage({
      roomId: event.message.roomId,
      messageId: event.message.id,
      createdAt: event.message.createdAt,
      authorId: event.message.author.id,
    })
  })
  const stepIndex = new Map<string, number>()
  const unsubscribeSteps = options.control.subscribeSteps((runId, step) => {
    const run = options.store.getRun(runId)
    if (!run) return
    const idx = stepIndex.get(runId) ?? 0
    stepIndex.set(runId, idx + 1)
    const stored: StoredStep = {
      id: crypto.randomUUID(),
      runId,
      roomId: run.roomId,
      idx,
      kind: step.kind,
      ...(step.tool !== undefined ? { tool: step.tool } : {}),
      ...(step.callId !== undefined ? { callId: step.callId } : {}),
      text: step.text,
      createdAt: step.at,
    }
    options.store.appendStep(stored)
    broadcastRoom(run.roomId, { type: 'run.step', runId, step: stored })
  })
  options.store.failStaleRuns().forEach((run) => {
    broadcastRoom(run.roomId, { type: 'run.changed', run })
    notifyRunTerminal(run)
  })
  scheduleRunner?.failStaleRuns()
  scheduleRunner?.tick()
  issueRunner?.failStaleRuns()
  const scheduleInterval = scheduleRunner
    ? setInterval(() => scheduleRunner!.tick(), 15_000)
    : undefined
  const grillLeaseInterval = options.grillStore
    ? setInterval(() => expireGrillLeases(), 1_000)
    : undefined
  const schedulesHttp = options.scheduleStore
    ? createSchedulesHttp({
        scheduleStore: options.scheduleStore,
        scheduleRunner,
        agentDefinitions,
        broadcastWorkspace,
      })
    : undefined
  const issuesHttp = options.issueStore
    ? createIssuesHttp({
        issueStore: options.issueStore,
        issueRunner,
        agentDefinitions,
        listWorkspaceUsers: () => options.store.listWorkspaceUsers(),
        broadcastWorkspace,
      })
    : undefined
  const bulletinsHttp = options.bulletinStore
    ? createBulletinsHttp({
        bulletinStore: options.bulletinStore,
        broadcastWorkspace,
      })
    : undefined
  const docsHttp = options.docStore
    ? createDocsHttp({
        docStore: options.docStore,
        broadcastWorkspace,
      })
    : undefined
  const grillsHttp = options.grillStore
    ? createGrillsHttp({
        grillStore: options.grillStore,
        broadcastGrillAttention,
        broadcastGrillChanged,
        hasActiveEditLeases: hasActiveGrillLeases,
        linkedRuns: createGrillLinkedRuns({
          startWarm: ({
            grillId,
            task,
            agentDefinitionId,
            idleTtlMs,
            onCreate,
          }) =>
            options.control.start(task, {
              grillId,
              agentDefinitionId,
              warm: true,
              idleTtlMs,
              onCreate,
            }),
          followUp: (runId, task) => options.control.followUp(runId, task),
          cancel: (runId) => options.control.cancel(runId),
          getRun: (runId) => options.control.getRun(runId),
          subscribeSteps: (listener) => options.control.subscribeSteps(listener),
        }),
      })
    : undefined
  const oneshotsHttp = createOneshotsHttp({
    oneshotSession,
    agentDefinitions,
  })
  const roomsHttp = createRoomsHttp({
    store: options.store,
    messages: options.messages,
    control: options.control,
    attachmentsDirectory,
    historyPageSize: roomHistoryPageSize,
    agentReady: options.agentReady,
    roomsFor,
    broadcastWorkspace,
    broadcastWorkspaceToUsers,
    broadcastRoom,
  })
  const membersHttp = createMembersHttp({
    store: options.store,
    broadcastWorkspaceToUsers,
    broadcastRoom,
    broadcastAttention: (userId, roomId) =>
      broadcastAttention(userId, roomId),
  })
  const server = Bun.serve<SocketData>({
    port: options.port ?? 3001,
    async fetch(request, server) {
      const url = new URL(request.url)
      const origin = allowedOrigin(
        request.headers.get('origin'),
        options.origin,
      )
      const cors = (response: Response): Response => withCors(response, origin!)
      if (!origin) return json({ error: 'Forbidden' }, 403)
      if (request.method === 'OPTIONS')
        return cors(
          new Response(null, {
            status: 204,
            headers: {
              'access-control-allow-headers':
                'content-type, x-sweat-setup-token',
              'access-control-allow-methods':
                'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            },
          }),
        )
      const admissionResponse = admissionHandler
        ? await admissionHandler(request, url)
        : undefined
      if (admissionResponse) return cors(admissionResponse)
      if (url.pathname.startsWith('/api/auth/'))
        return cors(await options.authHandler(request))
      const stream = url.pathname.match(/^\/api\/rooms\/([^/]+)\/stream$/)
      const grillStream = url.pathname.match(/^\/api\/grills\/([^/]+)\/stream$/)
      const workspaceStream = url.pathname === '/api/workspace/stream'
      if (
        (stream || grillStream || workspaceStream) &&
        request.headers.get('upgrade')?.toLowerCase() === 'websocket'
      ) {
        // Authenticate the upgrade by realtime ticket (desktop) or session (browser).
        const ticket = url.searchParams.get('ticket')
        const ticketUserId = ticket ? verifyRealtimeTicket(ticket) : undefined
        const sessionUser = ticketUserId
          ? undefined
          : await options.authenticator.authenticate(request)
        const userId = ticketUserId ?? sessionUser?.id
        if (!userId) return cors(json({ error: 'Unauthorized' }, 401))
        if (workspaceStream)
          return server.upgrade(request, {
            data: { scope: 'workspace', userId },
          })
            ? undefined
            : json({ error: 'Upgrade failed' }, 400)
        if (grillStream) {
          const grillId = grillStream[1]!
          if (!options.grillStore?.getGrillForUser(grillId, userId))
            return cors(json({ error: 'Grill not found' }, 404))
          const user = sessionUser ??
            options.store
              .listWorkspaceUsers()
              .find(({ id }) => id === userId) ?? { id: userId, name: userId }
          return server.upgrade(request, {
            data: {
              scope: 'grill',
              grillId,
              userId,
              user,
              presenceId: crypto.randomUUID(),
            },
          })
            ? undefined
            : json({ error: 'Upgrade failed' }, 400)
        }
        const roomId = stream![1]!
        if (!options.store.canAccessRoom(roomId, userId))
          return cors(json({ error: 'Room not found' }, 404))
        return server.upgrade(request, {
          data: { scope: 'room', roomId, userId },
        })
          ? undefined
          : json({ error: 'Upgrade failed' }, 400)
      }
      const user = await options.authenticator.authenticate(request)
      if (!user) return cors(json({ error: 'Unauthorized' }, 401))
      if (url.pathname === '/api/realtime-ticket' && request.method === 'GET')
        return cors(json({ ticket: mintRealtimeTicket(user.id) }))
      if (url.pathname === '/api/agent-definitions' && request.method === 'GET')
        return cors(json({ agents: agentDefinitions() }))
      const handled =
        (schedulesHttp
          ? await schedulesHttp(request, url, user)
          : undefined) ??
        (issuesHttp ? await issuesHttp(request, url) : undefined) ??
        (bulletinsHttp
          ? await bulletinsHttp(request, url, user)
          : undefined) ??
        (docsHttp ? await docsHttp(request, url, user) : undefined) ??
        (grillsHttp ? await grillsHttp(request, url, user) : undefined) ??
        (await oneshotsHttp(request, url, user)) ??
        (await roomsHttp(request, url, user)) ??
        (await membersHttp(request, url, user))
      if (handled) return cors(handled)
      return cors(json({ error: 'Not found' }, 404))
    },
    websocket: {
      open(socket) {
        sockets.add(socket)
        sendSnapshot(socket)
        if (socket.data.scope === 'grill')
          broadcastGrillPresence(socket.data.grillId)
      },
      message(socket, message) {
        const raw = message.toString()
        if (raw === 'snapshot') sendSnapshot(socket)
        else handleGrillMessage(socket, raw)
      },
      close(socket) {
        releaseSocketGrillLeases(socket)
        sockets.delete(socket)
        if (socket.data.scope === 'grill')
          broadcastGrillPresence(socket.data.grillId)
      },
    },
  })
  let stopping: Promise<void> | undefined
  return {
    port: server.port,
    stop: () =>
      (stopping ??= (async () => {
        unsubscribe()
        unsubscribeMessages()
        unsubscribeSteps()
        if (scheduleInterval) clearInterval(scheduleInterval)
        if (grillLeaseInterval) clearInterval(grillLeaseInterval)
        scheduleRunner?.stop()
        issueRunner?.stop()
        oneshotSession.stop()
        await Promise.all([server.stop(true), options.control.stop()])
      })()),
  }
}

if (import.meta.main) {
  const sandboxProviderName = parseSandboxProvider(
    process.env.SWEAT_SANDBOX_PROVIDER,
  )
  const { fileURLToPath } = await import('node:url')
  // Load the database first: auth and the session authenticator both depend on it.
  const { migrateDatabase, sqlite } = await import('../lib/database')
  await migrateDatabase(
    fileURLToPath(new URL('../../drizzle', import.meta.url)),
  )
  const [
    { auth },
    { betterAuthSessionAuthenticator },
    { createAdmissionStore },
    { createWorkspaceLlmConfig },
    { createWorkspaceCursorRuntimeConfig },
    { createWorkspaceAgentsExecutor },
    {
      createGitHubSoftwareEngineerAdapter,
      createLinearSoftwareEngineerAdapter,
      createWorkspaceDocsAdapter,
      createWorkspaceIssuesAdapter,
      createWorkspaceGrillAdapter,
      createWorkspaceSoftwareEngineerAdapter,
    },
    { createGitHubCliClient, publishGitHubBranchFiles },
    { createMcpGatewayHttpServer },
    { createAppleContainerClient },
    { createAppleContainerSandboxProvider },
    { createDockerSandboxProvider },
  ] = await Promise.all([
    import('../lib/auth'),
    import('./features/accounts/session-auth'),
    import('./features/accounts/admission'),
    import('./features/workspace/llm-config'),
    import('./features/workspace/cursor-runtime-config'),
    import('../../../agents/roster'),
    import('../../../agents/software-engineer-adapters'),
    import('../../../mcp/github'),
    import('../../../mcp/http'),
    import('../../../sdk/src'),
    import('../../../providers/apple-container-sandbox'),
    import('../../../providers/docker-sandbox'),
  ])
  const admissionStore = createAdmissionStore(sqlite)
  const llm = createWorkspaceLlmConfig(sqlite)
  const cursorRuntime = createWorkspaceCursorRuntimeConfig(sqlite)
  const connections = createWorkspaceConnections(sqlite)
  const skillsDirectory = skillDirectory(
    process.env.SWEAT_DATABASE_PATH ?? './sweat.sqlite',
  )
  const skills = createWorkspaceSkillStore({
    sqlite,
    directory: skillsDirectory,
  })
  const authContext = await auth.$context
  const githubRepository = process.env.SWEAT_GITHUB_REPOSITORY
  const store = createSqliteRoomStore(sqlite)
  const scheduleStore = createSqliteScheduleStore(sqlite)
  const issueStore = createSqliteIssueStore(sqlite, githubRepository)
  const bulletinStore = createSqliteBulletinStore(sqlite)
  const docStore = createSqliteDocStore(sqlite)
  const linearAccessToken = process.env.LINEAR_MCP_API_KEY
  const githubBase = process.env.SWEAT_GITHUB_BASE ?? 'main'
  const agentCaCertificate = process.env.SWEAT_AGENT_CA_CERT
  const github = githubRepository ? await createGitHubCliClient() : undefined
  const grillStore = createSqliteGrillStore(sqlite, {
    hasGuidanceSkill: (agentDefinitionId) =>
      skills.listAttachedSkillIds(agentDefinitionId).length > 0,
    defaultRepository: process.env.SWEAT_GITHUB_REPOSITORY,
    defaultBaseRef: process.env.SWEAT_GITHUB_BASE ?? 'main',
    createIssue: (input) =>
      issueStore.createIssue({
        id: input.id,
        title: input.title,
        description: input.description,
        ...(input.parentId ? { parentId: input.parentId } : {}),
        createdAt: input.createdAt,
      }),
    createDoc: (input) =>
      docStore.createDoc({
        id: input.id,
        title: input.title,
        body: input.body,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
      }),
    setIssueBranch: (issueId, branch, now) => {
      issueStore.updateIssue(issueId, { branch }, now)
    },
    ...(github
      ? {
          materializeCodeGrill: async (input) =>
            publishGitHubBranchFiles({
              octokit: github,
              repository: input.repository,
              base: input.baseRef,
              branch: input.branch,
              files: input.files,
            }),
        }
      : {}),
  })
  const issueNotify = {
    onCreated: (_issue: Issue) => {},
    onChanged: (_issue: Issue) => {},
    assignOwner: (issueId: string, owner: IssueOwner | undefined) => {
      const issue = issueStore.assignIssue(issueId, owner, Date.now())
      return { issue }
    },
    maybeStartForOwner: (issueId: string) => {
      const issue = issueStore.getIssue(issueId)
      if (!issue) throw new Error('Issue not found')
      return { issue }
    },
  }
  const grillNotify = {
    onChanged: (_grill: Grill) => {},
  }
  const messages = createRoomMessageHub(store)
  const attachmentsDirectory = attachmentDirectory(
    process.env.SWEAT_DATABASE_PATH ?? './sweat.sqlite',
  )
  const capabilityUrl = (u: string): string =>
    u.replace(
      'http://0.0.0.0',
      process.env.SWEAT_MCP_HOST ?? 'http://host.container.internal',
    )
  const sandboxProvider =
    sandboxProviderName === 'docker'
      ? createDockerSandboxProvider({
          ...(agentCaCertificate ? { caCertificate: agentCaCertificate } : {}),
        })
      : createAppleContainerSandboxProvider({
          container: createAppleContainerClient(),
        })
  const control = createRunControl(
    createWorkspaceAgentsExecutor({
      sandboxProvider,
      image: process.env.SWEAT_AGENT_IMAGE,
      cursorImage: process.env.SWEAT_CURSOR_AGENT_IMAGE,
      model: () => llm.model(),
      cursor: () => cursorRuntime.cursor(),
      attachmentSource: createRoomAttachmentSource({
        store,
        directory: attachmentsDirectory,
      }),
      skillSource: {
        async listForAgent(agentDefinitionId) {
          const packages = await skills.listAttachedPackages(agentDefinitionId)
          return packages.map(({ skill, files }) => ({
            name: skill.name,
            files,
          }))
        },
        layoutForAgent(agentDefinitionId) {
          const person = rosterPerson(agentDefinitionId)
          return person?.kind
        },
      },
      connectionAdapters: (agentDefinitionId) =>
        connections.adaptersForAgent(agentDefinitionId),
      adapters: [
        createWorkspaceSoftwareEngineerAdapter({
          port: {
            listMessages: (id) =>
              messages
                .listMessages(id)
                .map(({ attachments: _, ...message }) => message),
            postMessage: (input) => {
              messages.postMessage(input)
            },
          },
        }),
        createWorkspaceDocsAdapter({
          port: {
            listDocs: () =>
              docStore.listDocs().map((doc) => ({
                id: doc.id,
                title: doc.title,
                createdBy: doc.createdBy,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
              })),
            getDoc: (id) => docStore.getDoc(id),
          },
        }),
        createWorkspaceIssuesAdapter({
          port: {
            listIssues: (filter) => issueStore.listIssues(filter),
            getIssue: (ref) => resolveIssue(issueStore, ref),
            createIssue: (input) => {
              if (input.owner?.kind === 'agent') {
                const known = rosterDefinitionSummaries().some(
                  (agent) => agent.id === input.owner!.id,
                )
                if (!known) throw new Error('Unknown agent definition')
              }
              if (input.owner?.kind === 'account') {
                const known = store
                  .listWorkspaceUsers()
                  .some((user) => user.id === input.owner!.id)
                if (!known) throw new Error('Unknown account')
              }
              const issue = issueStore.createIssue({
                id: crypto.randomUUID(),
                title: input.title,
                ...(input.description !== undefined
                  ? { description: input.description }
                  : {}),
                ...(input.status ? { status: input.status } : {}),
                ...(input.priority ? { priority: input.priority } : {}),
                ...(input.tags ? { tags: input.tags } : {}),
                ...(input.parentId ? { parentId: input.parentId } : {}),
                ...(input.owner ? { owner: input.owner } : {}),
                createdAt: Date.now(),
              })
              issueNotify.onCreated(issue)
              if (input.owner?.kind === 'agent')
                return issueNotify.maybeStartForOwner(issue.id).issue
              return issue
            },
            updateIssue: (ref, patch) => {
              const issue = resolveIssue(issueStore, ref)
              if (!issue) throw new Error(`Issue not found: ${ref}`)
              const updated = issueStore.updateIssue(
                issue.id,
                {
                  ...(patch.title !== undefined ? { title: patch.title } : {}),
                  ...(patch.description !== undefined
                    ? { description: patch.description }
                    : {}),
                  ...(patch.status !== undefined
                    ? { status: patch.status }
                    : {}),
                  ...(patch.priority !== undefined
                    ? { priority: patch.priority }
                    : {}),
                  ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
                  ...(patch.timeSpent !== undefined
                    ? { timeSpent: patch.timeSpent }
                    : {}),
                  ...(patch.parentId !== undefined
                    ? { parentId: patch.parentId }
                    : {}),
                  ...(patch.branch !== undefined
                    ? { branch: patch.branch }
                    : {}),
                },
                Date.now(),
              )
              issueNotify.onChanged(updated)
              return updated
            },
            assignIssue: (ref, owner) => {
              const issue = resolveIssue(issueStore, ref)
              if (!issue) throw new Error(`Issue not found: ${ref}`)
              if (owner?.kind === 'agent') {
                const known = rosterDefinitionSummaries().some(
                  (agent) => agent.id === owner.id,
                )
                if (!known) throw new Error('Unknown agent definition')
              }
              if (owner?.kind === 'account') {
                const known = store
                  .listWorkspaceUsers()
                  .some((user) => user.id === owner.id)
                if (!known) throw new Error('Unknown account')
              }
              return issueNotify.assignOwner(issue.id, owner ?? undefined)
                .issue
            },
          },
          listAssignableOwners: () => [
            ...rosterDefinitionSummaries().map((agent) => ({
              kind: 'agent' as const,
              id: agent.id,
              name: agent.name,
            })),
            ...store.listWorkspaceUsers().map((user) => ({
              kind: 'account' as const,
              id: user.id,
              name: user.displayName || user.name,
            })),
          ],
        }),
        createWorkspaceGrillAdapter({
          port: {
            setFrontier: (grillId, frontier, now) => {
              const grill = grillStore.setFrontier(grillId, frontier, now)
              if (grill) grillNotify.onChanged(grill)
              return grill
            },
            setIssueProposal: (grillId, issues, now, files) => {
              const grill = grillStore.setIssueProposal(
                grillId,
                issues,
                now,
                files,
              )
              if (grill) grillNotify.onChanged(grill)
              return grill
            },
            setWriteup: (grillId, writeup, now) => {
              const grill = grillStore.setWriteup(grillId, writeup, now)
              if (grill) grillNotify.onChanged(grill)
              return grill
            },
          },
        }),
        ...(linearAccessToken
          ? [
              createLinearSoftwareEngineerAdapter({
                accessToken: linearAccessToken,
              }),
            ]
          : []),
        ...(github && githubRepository
          ? [
              createGitHubSoftwareEngineerAdapter({
                octokit: github,
                repository: githubRepository,
                base: githubBase,
                verifyCommand: process.env.SWEAT_VERIFY_COMMAND,
                bindIssueBranch: (issueId, branch) => {
                  const issue = issueStore.getIssue(issueId)
                  if (!issue || issue.branch) return
                  const updated = issueStore.updateIssue(
                    issueId,
                    { branch },
                    Date.now(),
                  )
                  issueNotify.onChanged(updated)
                },
              }),
            ]
          : []),
      ],
      createCapabilityEndpoint: (gateway) => {
        const server = createMcpGatewayHttpServer({
          gateway,
          hostname: '0.0.0.0',
        })
        return { url: capabilityUrl(server.url), close: server.close }
      },
    }),
  )
  const coordinator = createCoordinator({
    control,
    store,
    messages,
    authenticator: betterAuthSessionAuthenticator,
    authHandler: (request) => auth.handler(request),
    origin: process.env.SWEAT_GUI_ORIGIN ?? 'tauri://localhost',
    attachmentDirectory: attachmentsDirectory,
    port: Number(process.env.SWEAT_COORDINATOR_PORT ?? 3001),
    scheduleStore,
    issueStore,
    bulletinStore,
    docStore,
    grillStore,
    grillNotify,
    issueNotify,
    agentDefinitions: () => {
      const attachments = skills.listAttachments()
      const byAgent = new Map<
        string,
        { id: string; name: string; description: string }[]
      >()
      for (const [agentId, skillIds] of Object.entries(attachments)) {
        byAgent.set(
          agentId,
          skillIds.flatMap((skillId) => {
            const skill = skills.get(skillId)
            return skill
              ? [
                  {
                    id: skill.id,
                    name: skill.name,
                    description: skill.description,
                  },
                ]
              : []
          }),
        )
      }
      const linksByAgent = connections.listLinksByAgent()
      const connectionCapabilities = new Map<
        string,
        { id: string; name: string; tools: string[] }[]
      >()
      for (const [agentId, kindIds] of Object.entries(linksByAgent)) {
        connectionCapabilities.set(
          agentId,
          kindIds.flatMap((kindId) => {
            const kind = getConnectionKind(kindId)
            const connection = connections
              .list()
              .find((item) => item.id === kindId)
            if (!kind || !connection?.configured) return []
            const presentation = capabilityPresentation[kind.capabilityId]
            return [
              {
                id: kind.capabilityId,
                name: presentation?.name ?? kind.name,
                tools: kind.tools.map(
                  (tool) => presentation?.tools[tool] ?? tool,
                ),
              },
            ]
          }),
        )
      }
      return rosterDefinitionSummaries(byAgent, connectionCapabilities)
    },
    admission: {
      store: admissionStore,
      llm,
      cursorRuntime,
      skills,
      connections,
      listUsers: () => authContext.internalAdapter.listUsers(100),
      banUser: (request, userId) =>
        auth.api.banUser({ body: { userId }, headers: request.headers }),
      unbanUser: (request, userId) =>
        auth.api.unbanUser({ body: { userId }, headers: request.headers }),
      createAccount: async (body, role) => {
        const created = await auth.api.createUser({
          body: {
            email: body.email,
            password: body.password,
            name: body.name,
            role,
            data: {
              username: body.username,
              displayUsername: body.username,
            },
          },
          asResponse: true,
        })
        if (!created.ok) return created
        const signedIn = await auth.api.signInEmail({
          body: { email: body.email, password: body.password },
          asResponse: true,
        })
        return signedIn.ok ? signedIn : created
      },
    },
    agentReady: (agentDefinitionId) => {
      const person = rosterPerson(agentDefinitionId ?? '')
      if (!person) return false
      return person.kind === 'cursor'
        ? cursorRuntime.public().configured
        : llm.public().configured
    },
  })
  process.stdout.write(`Coordinator listening on ${coordinator.port}\n`)
  const setupToken = admissionStore.ensureSetupToken()
  if (setupToken) process.stdout.write(`Colony setup token: ${setupToken}\n`)
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
    try {
      await coordinator.stop()
      sqlite.close()
      process.exit(0)
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    }
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
