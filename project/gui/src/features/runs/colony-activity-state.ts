import { formatIssueId } from '#/server/features/issues/issue-model'
import type {
  WorkspaceActivityContext,
  WorkspaceActivityRun,
} from '#/server/features/runs/workspace-activity'
import type { RunState } from '#project/runs'

export function workingLabel(runs: readonly { agentId: string }[]): string {
  const count = runs.length
  const agents = new Set(runs.map((run) => run.agentId)).size
  if (agents === count)
    return count === 1 ? '1 agent working' : `${count} agents working`
  return count === 1 ? '1 run active' : `${count} runs active`
}

export function completionLabel(
  runs: readonly { state: RunState }[],
): string {
  const failed = runs.filter((run) => run.state === 'failed').length
  const completed = runs.length - failed
  if (failed && completed) return `${completed} completed, ${failed} failed`
  if (failed) return failed === 1 ? '1 failed' : `${failed} failed`
  return completed === 1 ? '1 completed' : `${completed} completed`
}

export function contextLabel(context: WorkspaceActivityContext): string {
  if (context.kind === 'room') return `Room · ${context.roomName}`
  if (context.kind === 'issue')
    return `Issue · ${formatIssueId(context.issueNumber)}`
  return `Schedule · ${context.scheduleName}`
}

export function createActivitySession() {
  const seen = new Set<string>()
  const announced = new Set<string>()
  return {
    noteActive(ids: readonly string[]) {
      for (const id of ids) seen.add(id)
    },
    trackedRecent<T extends { id: string }>(recent: readonly T[]): T[] {
      return recent.filter((run) => seen.has(run.id) && !announced.has(run.id))
    },
    announce(ids: readonly string[]) {
      for (const id of ids) announced.add(id)
    },
  }
}

export type ActivityHeaderPresentation =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'complete'; label: string; runs: WorkspaceActivityRun[] }

export function headerPresentation(
  runs: readonly WorkspaceActivityRun[],
  recent: readonly WorkspaceActivityRun[],
  session: ReturnType<typeof createActivitySession>,
): ActivityHeaderPresentation {
  if (runs.length)
    return { kind: 'working', label: workingLabel(runs) }
  const flash = session.trackedRecent(recent)
  if (!flash.length) return { kind: 'idle' }
  return {
    kind: 'complete',
    label: completionLabel(flash),
    runs: flash,
  }
}

export function activityLocation(run: WorkspaceActivityRun): {
  view: 'room' | 'issues' | 'schedules'
  id: string
  runId: string
} {
  if (run.context.kind === 'room')
    return { view: 'room', id: run.context.roomId, runId: run.id }
  if (run.context.kind === 'issue')
    return { view: 'issues', id: run.context.issueId, runId: run.id }
  return { view: 'schedules', id: run.context.scheduleId, runId: run.id }
}
