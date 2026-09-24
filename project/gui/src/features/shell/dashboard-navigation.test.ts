import { expect, test } from 'bun:test'
import {
  historyDirection,
  readDashboardLocation,
  writeDashboardLocation,
} from './dashboard-navigation'

test('dashboard navigation uses native history and restores its location', () => {
  const originalWindow = globalThis.window
  const calls: unknown[] = []
  let state: unknown = { preserved: true }
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
    value: { history },
  })

  try {
    writeDashboardLocation('account-1', { view: 'issues', id: 'issue-1' })
    expect(calls).toHaveLength(1)
    expect(readDashboardLocation(history.state, 'account-1')).toEqual({
      view: 'issues',
      id: 'issue-1',
    })
    expect(readDashboardLocation(history.state, 'account-2')).toBeUndefined()
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
})

test('command-arrow maps to history outside editors', () => {
  const event = {
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
  }
  expect(historyDirection({ ...event, key: 'ArrowLeft' })).toBe(-1)
  expect(historyDirection({ ...event, key: 'ArrowRight' })).toBe(1)
  expect(historyDirection({ ...event, key: 'x' })).toBe(0)
})

test('a malformed side surface is dropped but the rest of the location survives', () => {
  const state = {
    sweatDashboard: {
      accountId: 'account-1',
      location: { view: 'room', id: 'general', surface: { kind: 'bogus' } },
    },
  }
  expect(readDashboardLocation(state, 'account-1')).toEqual({
    view: 'room',
    id: 'general',
  })
})

test('removed dashboard views fall back to the default Room location', () => {
  for (const view of ['docs', 'grills']) {
    expect(
      readDashboardLocation(
        { sweatDashboard: { accountId: 'account-1', location: { view } } },
        'account-1',
      ) ?? { view: 'room' },
    ).toEqual({ view: 'room' })
  }
})
