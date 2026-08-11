const bottomThreshold = 150

export type ScrollMetrics = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/** Mirrors the Room timeline's near-bottom threshold (see dashboard.tsx). */
export function isNearBottom(
  metrics: ScrollMetrics,
  threshold = bottomThreshold,
): boolean {
  return (
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight < threshold
  )
}

export type ThreadScrollState = {
  atBottom: boolean
  newReplyCount: number
}

export const initialThreadScrollState: ThreadScrollState = {
  atBottom: true,
  newReplyCount: 0,
}

/**
 * Decides whether newly arrived replies should auto-scroll (near the
 * bottom) or accumulate behind a "New replies" jump control.
 */
export function applyIncomingReplies(
  state: ThreadScrollState,
  newReplyCount: number,
): ThreadScrollState {
  if (newReplyCount <= 0) return state
  if (state.atBottom) return { atBottom: true, newReplyCount: 0 }
  return { atBottom: false, newReplyCount: state.newReplyCount + newReplyCount }
}

export function applyScrollMetrics(
  state: ThreadScrollState,
  metrics: ScrollMetrics,
  threshold = bottomThreshold,
): ThreadScrollState {
  return isNearBottom(metrics, threshold)
    ? { atBottom: true, newReplyCount: 0 }
    : { ...state, atBottom: false }
}

export function acknowledgeNewReplies(
  _state: ThreadScrollState,
): ThreadScrollState {
  return { atBottom: true, newReplyCount: 0 }
}
