export type {
  Issue,
  IssueOwner,
  IssuePriority,
  IssueRun,
  IssueStatus,
} from '#/server/features/issues/issue-model'
export {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
} from '#/server/features/issues/issue-model'

import type {
  IssuePriority,
  IssueStatus,
} from '#/server/features/issues/issue-model'

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
