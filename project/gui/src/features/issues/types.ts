export type {
  Issue,
  IssueChildProgress,
  IssueOwner,
  IssuePriority,
  IssueRun,
  IssueStatus,
} from '#/server/issue-model'
export {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
} from '#/server/issue-model'

import type { IssuePriority, IssueRun, IssueStatus } from '#/server/issue-model'

export type IssueRunState = IssueRun['state']

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

export const ISSUE_PRIORITY_LABEL: Record<IssuePriority, string> = {
  none: 'No priority',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}
