import { json } from '#/server/http/respond'
import type { RoomStore, RoomUser } from '#/server/features/rooms/room-store'
import type { IssueStore } from '#/server/features/issues/issue-store'
import type { ScheduleStore } from '#/server/features/schedules/schedule-store'
import type { LiveRunFacts } from '#/server/features/runs/run-control'
import {
  collectWorkspaceActivity,
  RECENT_TERMINAL_WINDOW_MS,
} from './workspace-activity'

export { RECENT_TERMINAL_WINDOW_MS }
export type {
  WorkspaceActivityContext,
  WorkspaceActivityResponse,
  WorkspaceActivityRun,
  WorkspaceActivityStep,
} from './workspace-activity'

export function createActiveRunsHttp(deps: {
  roomStore: RoomStore
  issueStore?: IssueStore
  scheduleStore?: ScheduleStore
  liveRun?: (id: string) => LiveRunFacts | undefined
  now?: () => number
}): (
  request: Request,
  url: URL,
  user: RoomUser,
) => Promise<Response | undefined> {
  return async (request, url, user) => {
    if (url.pathname !== '/api/runs/active' || request.method !== 'GET')
      return
    return json(
      collectWorkspaceActivity(
        {
          roomStore: deps.roomStore,
          issueStore: deps.issueStore,
          scheduleStore: deps.scheduleStore,
          liveRun: deps.liveRun,
          now: (deps.now ?? Date.now)(),
        },
        user.id,
      ),
    )
  }
}
