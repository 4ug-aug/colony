import type { RunState } from '../../../../../runs'

export const ISSUE_TITLE_MAX = 500
export const ISSUE_DESCRIPTION_MAX = 10_000

export const ISSUE_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
] as const

export type IssueStatus = (typeof ISSUE_STATUSES)[number]

export const ISSUE_PRIORITIES = [
  'none',
  'low',
  'medium',
  'high',
  'urgent',
] as const

export type IssuePriority = (typeof ISSUE_PRIORITIES)[number]

export type IssueActor =
  | { kind: 'account'; id: string }
  | { kind: 'agent'; id: string }

export type IssueOwner = IssueActor

export type IssueChildProgress = { done: number; total: number }

export type IssueChild = {
  id: string
  number: number
  status: IssueStatus
  deliverable: string
  owner?: IssueOwner
  hasActiveRun?: boolean
}

export type Issue = {
  id: string
  number: number
  title: string
  description: string
  deliverable: string
  status: IssueStatus
  priority: IssuePriority
  tags: string[]
  timeSpent: number[]
  parentId?: string
  /** Own repository branch binding (unset = inherit). */
  branch?: string
  /** Resolved branch: own binding or nearest ancestor's. */
  effectiveBranch?: string
  branchUrl?: string
  owner?: IssueOwner
  createdBy?: IssueActor
  createdAt: number
  updatedAt: number
  childProgress?: IssueChildProgress
  /** Direct children; present on get, omitted from list. */
  children?: IssueChild[]
  /** True when this Issue has a preparing/running Issue-linked run. */
  hasActiveRun?: boolean
}

export type IssueRun = {
  id: string
  issueId: string
  task: string
  agentId: string
  provider: 'openai' | 'custom' | 'cursor'
  model: string
  state: RunState
  createdAt: number
  startedAt?: number
  completedAt?: number
  exitCode?: number
  error?: string
  stdout: string
  stderr: string
  waitingOn?: string
  preparation?: readonly string[]
}

export function formatIssueId(number: number): string {
  return `COL-${number}`
}

/** Platform Issue branch for a tree that has none yet. */
export function issueLineBranch(number: number): string {
  return `sweat/issue/${formatIssueId(number)}`
}

export function parseIssueRef(
  raw: string,
): { kind: 'number'; number: number } | { kind: 'id'; id: string } | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const match = /^(?:COL|SWE)-(\d+)$/i.exec(trimmed)
  if (match) return { kind: 'number', number: Number(match[1]) }
  return { kind: 'id', id: trimmed }
}
