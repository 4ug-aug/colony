import type { LiveRunFacts } from '#/server/features/runs/run-control'
import type { IssueRun as StoredIssueRun } from '#/server/features/issues/issue-model'

export type {
  Issue,
  IssueActor,
  IssueChild,
  IssueOwner,
  IssuePriority,
  IssueStatus,
} from '#/server/features/issues/issue-model'

/** As served: the stored run plus whatever the executor is live-overlaying. */
export type IssueRun = StoredIssueRun & Partial<LiveRunFacts>
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
