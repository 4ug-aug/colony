import { IssueActiveRunError } from '#/server/features/issues/issue-runner'
import {
  feedbackTask,
  isApprovalOnly,
  type DeliverFeedback,
  type DeliveryOutcome,
  type PullRequestFeedback,
} from './feedback'
import type { WatchedPullRequest } from './watched-pull-request-store'

export function createFeedbackDelivery(deps: {
  issueExists: (issueId: string) => boolean
  startIssueRun: (
    issueId: string,
    options: { agentDefinitionId: string; feedback: string },
  ) => void
  chamber: {
    deliverPullRequestFeedback(
      watch: WatchedPullRequest,
      feedback: PullRequestFeedback,
    ): DeliveryOutcome
  }
}): DeliverFeedback {
  return (watch, feedback) => {
    const { issueId } = watch
    if (!issueId || !deps.issueExists(issueId))
      return deps.chamber.deliverPullRequestFeedback(watch, feedback)
    if (isApprovalOnly(feedback)) return 'delivered'
    try {
      deps.startIssueRun(issueId, {
        agentDefinitionId: watch.agentDefinitionId,
        feedback: feedbackTask(feedback),
      })
      return 'delivered'
    } catch (error) {
      if (error instanceof IssueActiveRunError) return 'deferred'
      throw error
    }
  }
}
