import type { RunState } from '#/features/runs/run-helpers'
import type { Grill } from './types'

export const GRILL_LIST_STATUSES = [
  'your_turn',
  'in_progress',
  'failed',
  'complete',
  'settled',
] as const

export type GrillListStatus = (typeof GRILL_LIST_STATUSES)[number]

export const GRILL_LIST_STATUS_LABEL: Record<GrillListStatus, string> = {
  your_turn: 'Your turn',
  in_progress: 'In progress',
  failed: 'Failed',
  complete: 'Complete',
  settled: 'Settled',
}

type LinkedRunActivity = {
  state?: string
  turnActive?: boolean
  error?: string
}

/** Human needs to accept/push-back wrap-up (writeup and/or issue proposal). */
export function grillAwaitingWrapUpReview(
  grill: Pick<Grill, 'writeup' | 'docId' | 'issueProposal'>,
): boolean {
  if (grill.writeup && !grill.docId) return true
  return grill.issueProposal?.status === 'proposed'
}

export function grillIsComplete(
  grill: Pick<Grill, 'docId' | 'sessionBranch' | 'issueProposal'>,
): boolean {
  if (grill.docId || grill.sessionBranch) return true
  return grill.issueProposal?.status === 'confirmed'
}

export function grillTurnActive(grill: {
  linkedRun?: LinkedRunActivity
}): boolean {
  const linkedRun = grill.linkedRun
  if (!linkedRun) return false
  if (linkedRun.turnActive === true) return true
  const state = linkedRun.state as RunState | undefined
  return state === 'preparing'
}

/** List-row status bucket — precedence matches GrillListActivity. */
export function grillListStatus(
  grill: Pick<
    Grill,
    'frontier' | 'writeup' | 'docId' | 'issueProposal' | 'sessionBranch'
  > & {
    linkedRun?: LinkedRunActivity
  },
): GrillListStatus {
  if (grill.frontier.questions.length > 0) return 'your_turn'
  if (grillAwaitingWrapUpReview(grill)) return 'your_turn'
  if (grillIsComplete(grill)) return 'complete'

  const state = grill.linkedRun?.state as RunState | undefined
  const failed = state === 'failed' || state === 'cancelled'
  if (!failed && grillTurnActive(grill)) return 'in_progress'
  if (failed) return 'failed'
  return 'settled'
}
