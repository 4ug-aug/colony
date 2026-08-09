import type { DashboardView } from './room-sidebar'

export type DashboardLocation = { view: DashboardView; id?: string }

const views: DashboardView[] = [
  'room',
  'account',
  'workspace',
  'schedules',
  'issues',
  'bulletins',
  'docs',
  'grills',
]

export function readDashboardLocation(
  state: unknown,
  accountId: string,
): DashboardLocation | undefined {
  if (!state || typeof state !== 'object') return
  const entry = (state as { sweatDashboard?: unknown }).sweatDashboard
  if (!entry || typeof entry !== 'object') return
  const { accountId: owner, location } = entry as {
    accountId?: unknown
    location?: unknown
  }
  if (owner !== accountId || !location || typeof location !== 'object') return
  const { view, id } = location as { view?: unknown; id?: unknown }
  if (!views.includes(view as DashboardView)) return
  if (id !== undefined && typeof id !== 'string') return
  return { view: view as DashboardView, ...(id ? { id } : {}) }
}

export function writeDashboardLocation(
  accountId: string,
  location: DashboardLocation,
  replace = false,
) {
  const current =
    window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {}
  window.history[replace ? 'replaceState' : 'pushState'](
    { ...current, sweatDashboard: { accountId, location } },
    '',
  )
}

export function historyDirection(
  event: Pick<
    KeyboardEvent,
    'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'target'
  >,
): -1 | 0 | 1 {
  if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
    return 0
  if (
    typeof HTMLElement !== 'undefined' &&
    event.target instanceof HTMLElement &&
    event.target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    )
  )
    return 0
  return event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
}
