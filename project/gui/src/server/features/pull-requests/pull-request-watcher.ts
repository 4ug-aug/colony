import type { Octokit } from 'octokit'
import {
  httpStatus,
  readActivity,
  readChecks,
  type FailedCheck,
} from '#project/mcp/github-feedback'
import type { DeliverFeedback, PullRequestFeedback } from './feedback'
import type {
  WatchedPullRequest,
  WatchedPullRequestStore,
} from './watched-pull-request-store'

const MAX_PAGES = 3
const CI_GRACE_MS = 10 * 60_000
const WRITE_ACCESS = ['admin', 'maintain', 'write']
const REVIEW_STATES = ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'] as const

type PullRequest = Awaited<
  ReturnType<Octokit['rest']['pulls']['list']>
>['data'][number]

type Deps = {
  github: () => { octokit: Octokit; repository: string } | undefined
  store: WatchedPullRequestStore
  deliver: DeliverFeedback
  now?: () => number
}

const time = (iso: string) => Date.parse(iso)
type TrustCheck = (
  authors: ({ login: string; type: string } | null)[],
) => Promise<Set<string>>

// One permission lookup per login per check; the App cannot see private org membership, so author_association is unreliable.
function createTrustCheck(octokit: Octokit, owner: string, repo: string): TrustCheck {
  const lookups = new Map<string, Promise<boolean>>()
  const lookup = (username: string) => {
    let found = lookups.get(username)
    if (!found) {
      found = octokit.rest.repos
        .getCollaboratorPermissionLevel({ owner, repo, username })
        .then(({ data }) =>
          [data.permission, data.role_name].some((level) => WRITE_ACCESS.includes(level)),
        )
        .catch((error) => {
          if (httpStatus(error) !== 404)
            console.error(`Pull request watcher could not check permission of ${username}`, error)
          return false
        })
      lookups.set(username, found)
    }
    return found
  }
  return async (authors) => {
    const logins = [
      ...new Set(authors.flatMap((a) => (a && a.type !== 'Bot' ? [a.login] : []))),
    ]
    const results = await Promise.all(logins.map(async (login) => [login, await lookup(login)] as const))
    return new Set(results.flatMap(([login, ok]) => (ok ? [login] : [])))
  }
}

/** Eyes on delivered feedback, so reviewers see it was picked up; failures never undo a delivery. */
async function react(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  label: string,
  ids: { comments: number[]; inlineComments: number[] },
) {
  const results = await Promise.allSettled([
    ...ids.comments.map((id) =>
      octokit.rest.reactions.createForIssueComment({ ...repo, comment_id: id, content: 'eyes' }),
    ),
    ...ids.inlineComments.map((id) =>
      octokit.rest.reactions.createForPullRequestReviewComment({ ...repo, comment_id: id, content: 'eyes' }),
    ),
  ])
  for (const result of results)
    if (result.status === 'rejected')
      console.error(`Pull request reaction failed for ${label}`, result.reason)
}

export function createPullRequestWatcher(deps: Deps) {
  const now = deps.now ?? Date.now
  let running = false
  let warnedChecks = false

  async function listRecent(octokit: Octokit, owner: string, repo: string, oldest: number) {
    const found = new Map<number, PullRequest>()
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
        page,
      })
      for (const pr of data) found.set(pr.number, pr)
      const last = data.at(-1)
      if (data.length < 100 || !last || time(last.updated_at) < oldest) break
    }
    return found
  }

  async function checkWatch(
    octokit: Octokit,
    owner: string,
    repo: string,
    watch: WatchedPullRequest,
    pr: PullRequest,
    trust: TrustCheck,
  ) {
    if (pr.state === 'closed') {
      deps.store.remove(watch.repository, watch.number)
      return
    }
    const fetchedItems = time(pr.updated_at) > time(watch.cursor)
    const activity = fetchedItems
      ? await readActivity(octokit, { owner, repo }, watch.number, watch.cursor)
      : { reviews: [], comments: [] }
    const candidates = {
      reviews: activity.reviews.flatMap((review) => {
        const state = REVIEW_STATES.find((s) => s === review.state)
        return state ? [{ ...review, state }] : []
      }),
      comments: activity.comments,
    }
    const trusted = await trust([
      ...candidates.reviews.map((review) => review.author),
      ...candidates.comments.map((comment) => comment.author),
    ])
    const isTrusted = (author: { login: string } | null) => !!author && trusted.has(author.login)
    const reviews = candidates.reviews.filter((review) => isTrusted(review.author))
    const comments = candidates.comments.filter((comment) => isTrusted(comment.author))

    const { settled, failed } =
      pr.head.sha === watch.checkedSha
        ? { settled: false, failed: [] }
        : await settledChecks(octokit, owner, repo, pr)

    const feedback: PullRequestFeedback = {
      repository: watch.repository,
      number: watch.number,
      title: pr.title,
      url: pr.html_url,
      headSha: pr.head.sha,
      reviews: reviews.map((review) => ({
        author: review.author?.login ?? 'unknown',
        state: review.state,
        body: review.body,
        inlineComments: review.inlineComments.length,
        submittedAt: review.submittedAt,
      })),
      comments: comments.map((comment) => ({
        author: comment.author?.login ?? 'unknown',
        body: comment.body,
        createdAt: comment.createdAt,
      })),
      failedChecks: failed.map(({ name, conclusion, title }) => ({ name, conclusion, title })),
    }
    const hasFeedback =
      feedback.reviews.length || feedback.comments.length || feedback.failedChecks.length
    if (hasFeedback && deps.deliver(watch, feedback) !== 'delivered') return

    // Everything fetched is now handled: skipped as untrusted, or delivered.
    const cursor = fetchedItems
      ? [pr.updated_at, ...reviews.map((r) => r.submittedAt), ...comments.map((c) => c.createdAt)].sort(
          (a, b) => time(b) - time(a),
        )[0]
      : undefined
    const checkedSha = settled ? pr.head.sha : undefined
    if (cursor || checkedSha)
      deps.store.advance(watch.repository, watch.number, { cursor, checkedSha }, now())
    if (hasFeedback)
      await react(octokit, { owner, repo }, `${watch.repository}#${watch.number}`, {
        comments: comments.map(({ id }) => id),
        inlineComments: reviews.flatMap((review) => review.inlineComments.map(({ id }) => id)),
      })
  }

  /** A head commit is settled once every check run completed; with none, after a grace period for CI to start. */
  async function settledChecks(
    octokit: Octokit,
    owner: string,
    repo: string,
    pr: PullRequest,
  ): Promise<{ settled: boolean; failed: FailedCheck[] }> {
    const checks = await readChecks(octokit, { owner, repo }, pr.head.sha)
    if (checks.kind === 'unavailable' && !warnedChecks) {
      warnedChecks = true
      console.error('Pull request watcher cannot read checks: the GitHub App needs the Checks: read permission')
    }
    if (checks.kind !== 'settled') return { settled: false, failed: [] }
    const settled = checks.runs > 0 || now() - time(pr.updated_at) > CI_GRACE_MS
    return { settled, failed: settled ? checks.failed : [] }
  }

  return {
    async tick() {
      if (running) return
      running = true
      try {
        const github = deps.github()
        if (!github) return
        const watches = deps.store.list().filter((w) => w.repository === github.repository)
        if (!watches.length) return
        const [owner, repo] = github.repository.split('/')
        const oldest = Math.min(...watches.map((w) => time(w.cursor)))
        const recent = await listRecent(github.octokit, owner, repo, oldest)
        const trust = createTrustCheck(github.octokit, owner, repo)
        for (const watch of watches) {
          const pr = recent.get(watch.number)
          // ponytail: only the 300 most recently updated pull requests are seen; a busier repository needs pulls.get per watch.
          if (!pr) continue
          try {
            await checkWatch(github.octokit, owner, repo, watch, pr, trust)
          } catch (error) {
            console.error(`Pull request watcher failed for ${watch.repository}#${watch.number}`, error)
          }
        }
      } catch (error) {
        console.error('Pull request watcher tick failed', error)
      } finally {
        running = false
      }
    },
  }
}
