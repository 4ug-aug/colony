import { create } from 'zustand'
import { combine } from 'zustand/middleware'
import { shallow } from 'zustand/shallow'
import { activityLocation } from '#/features/runs/colony-activity-state'
import type { WorkspaceActivityRun } from '#/server/features/runs/workspace-activity'
import {
  readDashboardLocation,
  writeDashboardLocation,
} from './dashboard-navigation'
import type { DashboardLocation } from './dashboard-navigation'

type PendingThreadFocus = {
  rootId: string
  focusReplyId: string
}

function initialDashboardLocation(accountId: string): DashboardLocation {
  const pathIssue = window.location.pathname.match(/^\/issues\/([^/]+)$/)
  if (pathIssue?.[1]) {
    try {
      return { view: 'issues', id: decodeURIComponent(pathIssue[1]) }
    } catch {
      // A malformed deep link is just an invalid initial location.
    }
  }
  return (
    readDashboardLocation(window.history.state, accountId) ?? { view: 'room' }
  )
}

const initialState = {
  accountId: '',
  location: { view: 'room' } as DashboardLocation,
  pendingThreadFocus: undefined as PendingThreadFocus | undefined,
}

export const useDashboardStore = create(
  combine(initialState, (set, get) => {
    const commit = (next: DashboardLocation, replace = false) => {
      const { accountId, location } = get()
      if (
        location.view === next.view &&
        location.id === next.id &&
        shallow(location.surface, next.surface)
      )
        return
      writeDashboardLocation(accountId, next, replace)
      set({ location: next, pendingThreadFocus: undefined })
    }

    return {
      bootstrap(accountId: string) {
        if (get().accountId === accountId) return
        const location = initialDashboardLocation(accountId)
        writeDashboardLocation(accountId, location, true)
        set({ ...initialState, accountId, location })
      },
      applyFromHistory(state: unknown) {
        const next = readDashboardLocation(state, get().accountId)
        if (!next) return
        set({ location: next, pendingThreadFocus: undefined })
      },
      navigate(next: DashboardLocation) {
        const { location } = get()
        if (next.view === location.view && next.id === location.id) return
        commit(next)
      },
      openThread(rootId: string, focusReplyId?: string) {
        const location = get().location
        commit({
          ...location,
          surface: {
            kind: 'thread',
            rootId,
            ...(focusReplyId ? { focusReplyId } : {}),
          },
        })
      },
      openActivity(runId: string) {
        const location = get().location
        const fromRootId =
          location.surface?.kind === 'thread'
            ? location.surface.rootId
            : location.surface?.kind === 'activity'
              ? location.surface.fromRootId
              : undefined
        commit({
          ...location,
          surface: {
            kind: 'activity',
            runId,
            ...(fromRootId ? { fromRootId } : {}),
          },
        })
      },
      openWorkspaceActivity(run: WorkspaceActivityRun) {
        const target = activityLocation(run)
        const { location } = get()
        if (
          location.view === target.view &&
          location.id === target.id &&
          location.surface?.kind === 'activity' &&
          location.surface.runId === target.runId
        )
          return
        commit({
          view: target.view,
          id: target.id,
          surface: { kind: 'activity', runId: target.runId },
        })
      },
      closeSideSurface() {
        const { location } = get()
        const surface = location.surface
        if (!surface) return
        if (surface.kind === 'activity' && surface.fromRootId) {
          commit({
            ...location,
            surface: { kind: 'thread', rootId: surface.fromRootId },
          })
          return
        }
        const { surface: _current, ...rest } = location
        commit(rest)
      },
      clearThreadFocus() {
        const { location } = get()
        if (
          location.surface?.kind !== 'thread' ||
          !location.surface.focusReplyId
        )
          return
        commit(
          {
            ...location,
            surface: { kind: 'thread', rootId: location.surface.rootId },
          },
          true,
        )
      },
    }
  }),
)
