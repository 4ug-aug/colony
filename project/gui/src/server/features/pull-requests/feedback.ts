import type { WatchedPullRequest } from './watched-pull-request-store'

/** New Pull request feedback on one Watched pull request, gathered in one watcher tick (ADR 0033). */
export type PullRequestFeedback = {
  repository: string
  number: number
  title: string
  url: string
  headSha: string
  reviews: {
    author: string
    state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED'
    body: string
    inlineComments: number
    submittedAt: string
  }[]
  comments: { author: string; body: string; createdAt: string }[]
  failedChecks: { name: string; conclusion: string; title?: string }[]
}

/** `deferred` leaves the watch's cursor and checked commit alone so the next tick retries. */
export type DeliveryOutcome = 'delivered' | 'deferred'

export type DeliverFeedback = (
  watch: WatchedPullRequest,
  feedback: PullRequestFeedback,
) => DeliveryOutcome

/** Approvals with nothing to act on start no run. */
export const isApprovalOnly = (feedback: PullRequestFeedback): boolean =>
  feedback.comments.length === 0 &&
  feedback.failedChecks.length === 0 &&
  feedback.reviews.length > 0 &&
  feedback.reviews.every(
    (review) =>
      review.state === 'APPROVED' &&
      !review.body.trim() &&
      review.inlineComments === 0,
  )

const clip = (text: string, limit: number) =>
  text.length > limit ? `${text.slice(0, limit)}…` : text

/** The task text for an agent acting on feedback, shared by Chamber and Issue delivery. */
export function feedbackTask(feedback: PullRequestFeedback): string {
  const lines = [
    `New feedback on pull request #${feedback.number} (${feedback.title}): ${feedback.url}`,
  ]
  for (const review of feedback.reviews) {
    const inline = review.inlineComments
      ? ` with ${review.inlineComments} inline comment${review.inlineComments === 1 ? '' : 's'}`
      : ''
    lines.push(
      '',
      `Review by @${review.author}: ${review.state.toLowerCase().replace('_', ' ')}${inline}.`,
    )
    if (review.body.trim()) lines.push(clip(review.body.trim(), 1_000))
  }
  for (const comment of feedback.comments)
    lines.push('', `Comment by @${comment.author}:`, clip(comment.body.trim(), 1_000))
  if (feedback.failedChecks.length)
    lines.push(
      '',
      `Failed checks on ${feedback.headSha.slice(0, 7)}: ${feedback.failedChecks
        .map((check) => `${check.name} (${check.conclusion})`)
        .join(', ')}.`,
    )
  lines.push(
    '',
    `Read the full feedback with github.get_pull_request_feedback (number ${feedback.number}), check out the pull request with github.checkout_pull_request, make the changes, commit, push them with github.push_to_pull_request, and reply on the pull request with github.comment_on_pull_request saying what you changed.`,
  )
  return lines.join('\n')
}
