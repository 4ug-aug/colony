import { Markdown } from '#/components/markdown'
import { GitPullRequest } from 'lucide-react'
import type { MessageDelivery } from './types'

/** A message GitHub feedback produced rather than the account's typing, labelled as such. */
export function PullRequestFeedbackBody({
  delivery,
  text,
  mentions,
}: {
  delivery: Extract<MessageDelivery, { kind: 'pull_request_feedback' }>
  text: string
  mentions: string[]
}) {
  return (
    <>
      <a
        href={delivery.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
      >
        <GitPullRequest className="size-3" />
        From GitHub · PR #{delivery.number}
      </a>
      <Markdown mentions={mentions}>{text}</Markdown>
    </>
  )
}
