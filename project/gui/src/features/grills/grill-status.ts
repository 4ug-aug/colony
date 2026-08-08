import type { Grill } from './types'

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
