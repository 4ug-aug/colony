/**
 * The single side surface a Room can show at once: a thread rail or a Run
 * Activity rail. The two never stack — opening one always exits the other
 * first, matching the existing Run Activity rail/sheet responsiveness.
 */
export type ThreadTransitionSurface =
  { kind: 'thread'; rootId: string } | { kind: 'activity'; runId: string }

export type ThreadTransitionState =
  | { phase: 'closed' }
  | { phase: 'open'; surface: ThreadTransitionSurface }
  | {
      phase: 'exiting'
      surface: ThreadTransitionSurface
      next?: ThreadTransitionSurface
    }

export function sameThreadSurface(
  a: ThreadTransitionSurface | undefined,
  b: ThreadTransitionSurface | undefined,
): boolean {
  if (!a || !b) return a === b
  if (a.kind !== b.kind) return false
  return a.kind === 'thread'
    ? a.rootId === (b as { rootId: string }).rootId
    : a.runId === (b as { runId: string }).runId
}

/**
 * Requests that `target` become the visible surface. If nothing is open,
 * it opens directly. Otherwise the current surface always exits first;
 * `finishThreadExit` opens the queued `target` once that exit completes.
 * Re-requesting while already exiting only updates the queued target, so
 * at most one surface is ever entering and one is ever exiting.
 */
export function requestThreadSurface(
  state: ThreadTransitionState,
  target: ThreadTransitionSurface | undefined,
): ThreadTransitionState {
  const current = state.phase === 'closed' ? undefined : state.surface
  if (sameThreadSurface(current, target))
    return current ? { phase: 'open', surface: current } : { phase: 'closed' }
  if (!current)
    return target ? { phase: 'open', surface: target } : { phase: 'closed' }
  return { phase: 'exiting', surface: current, next: target }
}

export function finishThreadExit(
  state: ThreadTransitionState,
): ThreadTransitionState {
  if (state.phase !== 'exiting') return state
  return state.next
    ? { phase: 'open', surface: state.next }
    : { phase: 'closed' }
}
