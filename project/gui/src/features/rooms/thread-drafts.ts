/**
 * One in-memory draft per thread root for the app session. Never persisted
 * server-side; switching or closing a rail preserves the draft, and a
 * successful submission clears it via `withoutThreadDraft`.
 */
export type ThreadDrafts = Readonly<Record<string, string>>

export const emptyThreadDrafts: ThreadDrafts = {}

export function threadDraft(drafts: ThreadDrafts, rootId: string): string {
  return drafts[rootId] ?? ''
}

export function withThreadDraft(
  drafts: ThreadDrafts,
  rootId: string,
  text: string,
): ThreadDrafts {
  return { ...drafts, [rootId]: text }
}

export function withoutThreadDraft(
  drafts: ThreadDrafts,
  rootId: string,
): ThreadDrafts {
  if (!(rootId in drafts)) return drafts
  const next = { ...drafts }
  delete next[rootId]
  return next
}
