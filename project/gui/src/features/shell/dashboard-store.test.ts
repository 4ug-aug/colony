import { expect, test } from 'bun:test'
import type { WorkspaceActivityRun } from '#/server/features/runs/workspace-activity'
import { useDashboardStore } from './dashboard-store'

function resetStore() {
  useDashboardStore.setState(useDashboardStore.getInitialState(), true)
}

function withHistory(
  run: (history: {
    state: unknown
    pushState: (next: unknown) => void
    replaceState: (next: unknown) => void
  }) => void,
  pathname = '/',
) {
  const originalWindow = globalThis.window
  let state: unknown
  const calls: unknown[] = []
  const history = {
    get state() {
      return state
    },
    pushState(next: unknown) {
      calls.push(next)
      state = next
    },
    replaceState(next: unknown) {
      state = next
    },
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { history, location: { pathname } },
  })
  resetStore()
  try {
    run(history)
    return calls
  } finally {
    resetStore()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
}

test('bootstrap reads the account location and openThread writes history', () => {
  withHistory((history) => {
    history.replaceState({
      sweatDashboard: {
        accountId: 'account-1',
        location: { view: 'room', id: 'general' },
      },
    })
    const store = useDashboardStore.getState()
    store.bootstrap('account-1')
    expect(useDashboardStore.getState().location).toEqual({
      view: 'room',
      id: 'general',
    })
    store.openThread('root-1')
    expect(useDashboardStore.getState().location.surface).toEqual({
      kind: 'thread',
      rootId: 'root-1',
    })
  })
})

test('closeSideSurface restores a thread through activity switches and reselection', () => {
  withHistory((history) => {
    const store = useDashboardStore.getState()
    store.bootstrap('account-1')
    store.navigate({ view: 'room', id: 'general' })
    store.openThread('root-1')
    store.openActivity('run-1')
    store.openActivity('run-2')
    const currentEntry = history.state
    store.openWorkspaceActivity({
      id: 'run-2',
      agentId: 'antboy',
      state: 'running',
      createdAt: 1,
      context: { kind: 'room', roomId: 'general', roomName: 'General' },
    })
    expect(history.state).toBe(currentEntry)
    expect(useDashboardStore.getState().location.surface).toEqual({
      kind: 'activity',
      runId: 'run-2',
      fromRootId: 'root-1',
    })
    store.closeSideSurface()
    expect(useDashboardStore.getState().location.surface).toEqual({
      kind: 'thread',
      rootId: 'root-1',
    })
    store.closeSideSurface()
    expect(useDashboardStore.getState().location).toEqual({
      view: 'room',
      id: 'general',
    })
  })
})

test('opening the same thread is deduplicated', () => {
  const calls = withHistory(() => {
    const store = useDashboardStore.getState()
    store.bootstrap('account-1')
    store.openThread('root-1')
    store.openThread('root-1')
    expect(useDashboardStore.getState().location.surface).toEqual({
      kind: 'thread',
      rootId: 'root-1',
    })
  })
  expect(calls).toHaveLength(1)
})

test('navigation clears pending focus and preserves same-view no-op semantics', () => {
  withHistory((history) => {
    const store = useDashboardStore.getState()
    store.bootstrap('account-1')
    useDashboardStore.setState({
      pendingThreadFocus: { rootId: 'root-1', focusReplyId: 'reply-1' },
    })
    store.navigate({ view: 'issues', id: 'issue-1' })
    expect(useDashboardStore.getState().pendingThreadFocus).toBeUndefined()
    expect(history.state).toMatchObject({
      sweatDashboard: {
        accountId: 'account-1',
        location: { view: 'issues', id: 'issue-1' },
      },
    })
    const calls = history.state
    store.navigate({
      view: 'issues',
      id: 'issue-1',
      surface: { kind: 'thread', rootId: 'root-1' },
    })
    expect(history.state).toBe(calls)
  })
})

test('history restores only the current account without writing a new entry', () => {
  withHistory((history) => {
    const store = useDashboardStore.getState()
    store.bootstrap('account-1')
    useDashboardStore.setState({
      pendingThreadFocus: { rootId: 'root-1', focusReplyId: 'reply-1' },
    })
    const state = {
      sweatDashboard: {
        accountId: 'account-1',
        location: { view: 'room', id: 'general' },
      },
    }
    history.replaceState(state)
    const historyState = history.state
    store.applyFromHistory(state)
    expect(useDashboardStore.getState().location).toEqual({
      view: 'room',
      id: 'general',
    })
    expect(useDashboardStore.getState().pendingThreadFocus).toBeUndefined()
    expect(history.state).toBe(historyState)
    store.applyFromHistory({
      sweatDashboard: {
        accountId: 'account-2',
        location: { view: 'issues', id: 'issue-2' },
      },
    })
    expect(useDashboardStore.getState().location).toEqual({
      view: 'room',
      id: 'general',
    })
  })
})

test('bootstrap resets account-local location and pending focus', () => {
  withHistory(() => {
    const store = useDashboardStore.getState()
    store.bootstrap('account-1')
    store.openThread('root-1')
    useDashboardStore.setState({
      pendingThreadFocus: { rootId: 'root-1', focusReplyId: 'reply-1' },
    })
    store.bootstrap('account-2')
    expect(useDashboardStore.getState()).toMatchObject({
      accountId: 'account-2',
      location: { view: 'room' },
      pendingThreadFocus: undefined,
    })
  })
})

test('malformed issue deep links fall back to the Room location', () => {
  withHistory(() => {
    useDashboardStore.getState().bootstrap('account-1')
    expect(useDashboardStore.getState().location).toEqual({ view: 'room' })
  }, '/issues/%E0%A4%A')
})

test('focus removal replaces the current history entry', () => {
  const calls = withHistory((history) => {
    const store = useDashboardStore.getState()
    store.bootstrap('account-1')
    store.openThread('root-1', 'reply-1')
    expect(
      (history.state as { sweatDashboard: { location: { surface: unknown } } })
        .sweatDashboard.location.surface,
    ).toEqual({
      kind: 'thread',
      rootId: 'root-1',
      focusReplyId: 'reply-1',
    })
    store.clearThreadFocus()
    expect(
      (history.state as { sweatDashboard: { location: { surface: unknown } } })
        .sweatDashboard.location.surface,
    ).toEqual({
      kind: 'thread',
      rootId: 'root-1',
    })
  })
  expect(calls).toHaveLength(1)
})

test('openWorkspaceActivity switches view and side surface together', () => {
  const run: WorkspaceActivityRun = {
    id: 'run-9',
    agentId: 'antboy',
    state: 'running',
    createdAt: 1,
    context: {
      kind: 'issue',
      issueId: 'issue-1',
      issueNumber: 1,
      issueTitle: 'Badge',
    },
  }
  withHistory((history) => {
    const store = useDashboardStore.getState()
    store.bootstrap('account-1')
    store.openWorkspaceActivity(run)
    const firstHistory = history.state
    store.openWorkspaceActivity(run)
    expect(history.state).toBe(firstHistory)
    expect(useDashboardStore.getState().location).toEqual({
      view: 'issues',
      id: 'issue-1',
      surface: { kind: 'activity', runId: 'run-9' },
    })
  })
})
