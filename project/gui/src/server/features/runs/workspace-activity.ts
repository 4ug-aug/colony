import type { RunState } from '#project/runs'
import {
  overlayLivePreparation,
  type LiveRunFacts,
} from '#/server/features/runs/run-control'
import type { RunStep } from '#/server/features/runs/run-storage'
import type { RoomStore, RoomRun } from '#/server/features/rooms/room-store'
import type { IssueStore, IssueRun } from '#/server/features/issues/issue-store'
import type {
  ScheduleStore,
  ScheduleRun,
} from '#/server/features/schedules/schedule-store'

export const RECENT_TERMINAL_WINDOW_MS = 30_000

export type WorkspaceActivityContext =
  | { kind: 'room'; roomId: string; roomName: string }
  | { kind: 'issue'; issueId: string; issueNumber: number; issueTitle: string }
  | { kind: 'schedule'; scheduleId: string; scheduleName: string }

export type WorkspaceActivityStep = {
  id: string
  runId: string
  roomId?: string
  idx: number
  kind: 'message' | 'tool_call' | 'tool_result'
  tool?: string
  callId?: string
  text: string
  createdAt: number
}

export type WorkspaceActivityRun = {
  id: string
  agentId: string
  state: RunState
  waitingOn?: string
  latestStep?: WorkspaceActivityStep
  context: WorkspaceActivityContext
  createdAt: number
  completedAt?: number
}

export type WorkspaceActivityResponse = {
  runs: WorkspaceActivityRun[]
  recent: WorkspaceActivityRun[]
}

const toStep = (step: RunStep, roomId?: string): WorkspaceActivityStep => ({
  id: step.id,
  runId: step.runId,
  idx: step.idx,
  kind: step.kind,
  text: step.text,
  createdAt: step.createdAt,
  ...(step.tool ? { tool: step.tool } : {}),
  ...(step.callId ? { callId: step.callId } : {}),
  ...(roomId ? { roomId } : {}),
})

const byCreated = (a: WorkspaceActivityRun, b: WorkspaceActivityRun) =>
  b.createdAt - a.createdAt || b.id.localeCompare(a.id)

function mapRoom(
  run: RoomRun,
  roomName: string,
  step: RunStep | undefined,
  live?: LiveRunFacts,
): WorkspaceActivityRun {
  const overlaid = overlayLivePreparation(run, live)
  return {
    id: run.id,
    agentId: run.agentId,
    state: run.state,
    createdAt: run.createdAt,
    context: { kind: 'room', roomId: run.roomId, roomName },
    ...(overlaid.waitingOn ? { waitingOn: overlaid.waitingOn } : {}),
    ...(step ? { latestStep: toStep(step, run.roomId) } : {}),
    ...(run.completedAt !== undefined ? { completedAt: run.completedAt } : {}),
  }
}

function mapIssue(
  run: IssueRun,
  issue: { number: number; title: string },
  step: RunStep | undefined,
  live?: LiveRunFacts,
): WorkspaceActivityRun {
  const overlaid = overlayLivePreparation(run, live)
  return {
    id: run.id,
    agentId: run.agentId,
    state: run.state,
    createdAt: run.createdAt,
    context: {
      kind: 'issue',
      issueId: run.issueId,
      issueNumber: issue.number,
      issueTitle: issue.title,
    },
    ...(overlaid.waitingOn ? { waitingOn: overlaid.waitingOn } : {}),
    ...(step ? { latestStep: toStep(step) } : {}),
    ...(run.completedAt !== undefined ? { completedAt: run.completedAt } : {}),
  }
}

function mapSchedule(
  run: ScheduleRun,
  scheduleName: string,
  step: RunStep | undefined,
  live?: LiveRunFacts,
): WorkspaceActivityRun {
  const overlaid = overlayLivePreparation(run, live)
  return {
    id: run.id,
    agentId: run.agentId,
    state: run.state,
    createdAt: run.createdAt,
    context: {
      kind: 'schedule',
      scheduleId: run.scheduleId,
      scheduleName,
    },
    ...(overlaid.waitingOn ? { waitingOn: overlaid.waitingOn } : {}),
    ...(step ? { latestStep: toStep(step) } : {}),
    ...(run.completedAt !== undefined ? { completedAt: run.completedAt } : {}),
  }
}

export function collectWorkspaceActivity(
  deps: {
    roomStore: RoomStore
    issueStore?: IssueStore
    scheduleStore?: ScheduleStore
    liveRun?: (id: string) => LiveRunFacts | undefined
    now: number
  },
  userId: string,
): WorkspaceActivityResponse {
  const since = deps.now - RECENT_TERMINAL_WINDOW_MS
  const live = (id: string) => deps.liveRun?.(id)

  const roomActive = deps.roomStore.listActiveRunsForUser(userId)
  const roomRecent = deps.roomStore.listRecentTerminalRunsForUser(userId, since)
  const roomSteps = deps.roomStore.latestStepsByRunIds([
    ...roomActive.map((run) => run.id),
    ...roomRecent.map((run) => run.id),
  ])
  const rooms = [...roomActive, ...roomRecent].flatMap((run) => {
    const room = deps.roomStore.getRoom(run.roomId)
    if (!room) return []
    return [
      mapRoom(run, room.name, roomSteps.get(run.id), live(run.id)),
    ]
  })

  const issues = deps.issueStore
    ? (() => {
        const active = deps.issueStore.listActiveRuns()
        const recent = deps.issueStore.listRecentTerminalRuns(since)
        const steps = deps.issueStore.latestStepsByRunIds([
          ...active.map((run) => run.id),
          ...recent.map((run) => run.id),
        ])
        return [...active, ...recent].flatMap((run) => {
          const issue = deps.issueStore!.getIssue(run.issueId)
          if (!issue) return []
          return [
            mapIssue(run, issue, steps.get(run.id), live(run.id)),
          ]
        })
      })()
    : []

  const schedules = deps.scheduleStore
    ? (() => {
        const active = deps.scheduleStore.listActiveRuns()
        const recent = deps.scheduleStore.listRecentTerminalRuns(since)
        const steps = deps.scheduleStore.latestStepsByRunIds([
          ...active.map((run) => run.id),
          ...recent.map((run) => run.id),
        ])
        return [...active, ...recent].flatMap((run) => {
          const schedule = deps.scheduleStore!.getSchedule(run.scheduleId)
          if (!schedule) return []
          return [
            mapSchedule(run, schedule.name, steps.get(run.id), live(run.id)),
          ]
        })
      })()
    : []

  const all = [...rooms, ...issues, ...schedules]
  const isActive = (run: WorkspaceActivityRun) =>
    run.state === 'preparing' || run.state === 'running'
  return {
    runs: all.filter(isActive).sort(byCreated),
    recent: all.filter((run) => !isActive(run)).sort(byCreated),
  }
}
