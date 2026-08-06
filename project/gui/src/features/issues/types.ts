export type IssueStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'

export type IssuePriority = 'none' | 'low' | 'medium' | 'high' | 'urgent'

export type IssueOwner =
  | { kind: 'account'; id: string }
  | { kind: 'agent'; id: string }

export type IssueChildProgress = { done: number; total: number }

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
  owner?: IssueOwner
  createdAt: number
  updatedAt: number
  childProgress?: IssueChildProgress
  hasActiveRun?: boolean
}

export type IssueRunState =
  | 'preparing'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type IssueRun = {
  id: string
  issueId: string
  task: string
  agentId: string
  provider: 'openai' | 'custom' | 'cursor'
  model: string
  state: IssueRunState
  createdAt: number
  startedAt?: number
  completedAt?: number
  exitCode?: number
  error?: string
  stdout: string
  stderr: string
}

export const ISSUE_STATUSES: readonly IssueStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
] as const

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

export const ISSUE_PRIORITIES: readonly IssuePriority[] = [
  'none',
  'low',
  'medium',
  'high',
  'urgent',
] as const

export const ISSUE_PRIORITY_LABEL: Record<IssuePriority, string> = {
  none: 'No priority',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}
