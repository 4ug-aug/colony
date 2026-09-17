/**
 * One in-memory draft per thread root for the app session. Never persisted
 * server-side; switching or closing a rail preserves the draft, and a
 * successful submission clears it via `clearThreadDraft`.
 */
const drafts: Record<string, string> = {}

export function threadDraft(rootId: string): string {
  return drafts[rootId] ?? ''
}

export function setThreadDraft(rootId: string, text: string): void {
  drafts[rootId] = text
}

export function clearThreadDraft(rootId: string): void {
  delete drafts[rootId]
}

export function resetThreadDrafts(): void {
  for (const rootId of Object.keys(drafts)) delete drafts[rootId]
}
