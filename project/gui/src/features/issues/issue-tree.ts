import type { Issue } from './types'

export type IssueTreeNode = {
  issue: Issue
  depth: number
}

const settled = (status: Issue['status']) =>
  status === 'in_review' || status === 'done'

export function childrenAreRunning(issue: Issue, issues: Issue[]): boolean {
  return issues.some(
    (child) => child.parentId === issue.id && Boolean(child.hasActiveRun),
  )
}

/** Agent-owned parent, idle, with at least one direct child not In review or Done. */
export function isWaitingToIntegrate(issue: Issue, issues: Issue[]): boolean {
  if (issue.owner?.kind !== 'agent' || issue.hasActiveRun) return false
  if (settled(issue.status)) return false
  const children = issues.filter((child) => child.parentId === issue.id)
  return (
    children.length > 0 && children.some((child) => !settled(child.status))
  )
}

export function parentWorkLabel(
  issue: Issue,
  issues: Issue[],
): 'Children running' | 'Waiting to integrate' | undefined {
  if (childrenAreRunning(issue, issues)) return 'Children running'
  if (isWaitingToIntegrate(issue, issues)) return 'Waiting to integrate'
}

/** Flatten issues into parent→child order within a status group. */
export function nestIssuesByParent(issues: Issue[]): IssueTreeNode[] {
  const byId = new Map(issues.map((issue) => [issue.id, issue]))
  const children = new Map<string, Issue[]>()
  const roots: Issue[] = []

  for (const issue of issues) {
    const parentId = issue.parentId
    if (parentId && byId.has(parentId)) {
      const siblings = children.get(parentId) ?? []
      siblings.push(issue)
      children.set(parentId, siblings)
    } else {
      roots.push(issue)
    }
  }

  const byNumber = (a: Issue, b: Issue) => a.number - b.number
  roots.sort(byNumber)
  for (const siblings of children.values()) siblings.sort(byNumber)

  const rows: IssueTreeNode[] = []
  const visit = (issue: Issue, depth: number) => {
    rows.push({ issue, depth })
    for (const child of children.get(issue.id) ?? []) visit(child, depth + 1)
  }
  for (const root of roots) visit(root, 0)
  return rows
}
