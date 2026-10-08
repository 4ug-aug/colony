import type { Octokit } from 'octokit'
import type { DeliverFeedback, PullRequestFeedback } from './feedback'
import type {
  WatchedPullRequest,
  WatchedPullRequestStore,
} from './watched-pull-request-store'

const MAX_PAGES = 3
const CI_GRACE_MS = 10 * 60_000
const WRITE_ACCESS = ['admin', 'maintain', 'write']
const REVIEW_STATES = ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED']
const FAILED = ['failure', 'timed_out', 'cancelled', 'action_required']

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
type Trusted = (item: { user: { login: string; type: string } | null }) => Promise<boolean>

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
    trusted: Trusted,
  ) {
    if (pr.state === 'closed') {
      deps.store.remove(watch.repository, watch.number)
      return
    }
    const cursor = time(watch.cursor)
    const fetchedItems = time(pr.updated_at) > cursor
    const feedback: PullRequestFeedback = {
      repository: watch.repository,
      number: watch.number,
      title: pr.title,
      url: pr.html_url,
      headSha: pr.head.sha,
      reviews: [],
      comments: [],
      failedChecks: [],
    }
    const stamps: string[] = []
    const reviewIds = new Set<number>()
    const commentIds: number[] = []
    let inlineIds: { id: number; reviewId: number }[] = []

    if (fetchedItems) {
      const base = { owner, repo }
      const [reviews, inline, comments] = await Promise.all([
        octokit.rest.pulls.listReviews({ ...base, pull_number: watch.number, per_page: 100 }),
        octokit.rest.pulls.listReviewComments({
          ...base,
          pull_number: watch.number,
          since: watch.cursor,
          per_page: 100,
        }),
        octokit.rest.issues.listComments({
          ...base,
          issue_number: watch.number,
          since: watch.cursor,
          per_page: 100,
        }),
      ])
      inlineIds = inline.data.flatMap((c) =>
        c.pull_request_review_id ? [{ id: c.id, reviewId: c.pull_request_review_id }] : [],
      )
      const inlineCounts = new Map<number, number>()
      for (const comment of inline.data)
        if (comment.pull_request_review_id)
          inlineCounts.set(
            comment.pull_request_review_id,
            (inlineCounts.get(comment.pull_request_review_id) ?? 0) + 1,
          )
      for (const review of reviews.data) {
        if (
          !review.submitted_at ||
          time(review.submitted_at) <= cursor ||
          !REVIEW_STATES.includes(review.state) ||
          !(await trusted(review))
        )
          continue
        feedback.reviews.push({
          author: review.user?.login ?? 'unknown',
          state: review.state as PullRequestFeedback['reviews'][number]['state'],
          body: review.body ?? '',
          inlineComments: inlineCounts.get(review.id) ?? 0,
          submittedAt: review.submitted_at,
        })
        stamps.push(review.submitted_at)
        reviewIds.add(review.id)
      }
      for (const comment of comments.data) {
        if (time(comment.created_at) <= cursor || !(await trusted(comment))) continue
        feedback.comments.push({
          author: comment.user?.login ?? 'unknown',
          body: comment.body ?? '',
          createdAt: comment.created_at,
        })
        stamps.push(comment.created_at)
        commentIds.push(comment.id)
      }
    }

    let settled = false
    if (pr.head.sha !== watch.checkedSha) {
      let runs: Awaited<ReturnType<Octokit['rest']['checks']['listForRef']>>['data']['check_runs'] | undefined
      try {
        runs = (
          await octokit.rest.checks.listForRef({ owner, repo, ref: pr.head.sha, per_page: 100 })
        ).data.check_runs
      } catch (error) {
        const status = (error as { status?: number }).status
        if (status !== 403 && status !== 404) throw error
        // Checks unavailable: deliver reviews and comments, retry checks next tick.
        if (!warnedChecks) {
          warnedChecks = true
          console.error('Pull request watcher cannot read checks: the GitHub App needs the Checks: read permission')
        }
      }
      settled = !!runs && runs.every((run) => run.status === 'completed')
      if (runs && settled && runs.length === 0)
        settled = now() - time(pr.updated_at) > CI_GRACE_MS
      if (runs && settled)
        for (const run of runs)
          if (run.conclusion && FAILED.includes(run.conclusion))
            feedback.failedChecks.push({
              name: run.name,
              conclusion: run.conclusion,
              title: run.output.title ?? undefined,
            })
    }

    const sha = settled ? pr.head.sha : undefined
    const hasFeedback =
      feedback.reviews.length || feedback.comments.length || feedback.failedChecks.length
    if (hasFeedback && deps.deliver(watch, feedback) !== 'delivered') return
    // Everything fetched is now handled: skipped as untrusted, or delivered.
    const nextCursor = fetchedItems
      ? [pr.updated_at, ...stamps].sort((a, b) => time(b) - time(a))[0]
      : undefined
    if (nextCursor || sha)
      deps.store.advance(
        watch.repository,
        watch.number,
        { cursor: nextCursor, checkedSha: sha },
        now(),
      )
    if (!hasFeedback) return
    const base = { owner, repo, content: 'eyes' } as const
    const results = await Promise.allSettled([
      ...commentIds.map((id) =>
        octokit.rest.reactions.createForIssueComment({ ...base, comment_id: id }),
      ),
      ...inlineIds
        .filter((c) => reviewIds.has(c.reviewId))
        .map((c) =>
          octokit.rest.reactions.createForPullRequestReviewComment({ ...base, comment_id: c.id }),
        ),
    ])
    for (const result of results)
      if (result.status === 'rejected')
        console.error(`Pull request reaction failed for ${watch.repository}#${watch.number}`, result.reason)
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
        // One permission lookup per login per tick; the App cannot see private org membership, so author_association is unreliable.
        const lookups = new Map<string, Promise<boolean>>()
        const trusted: Trusted = async (item) => {
          const login = item.user?.login
          if (!login || item.user?.type === 'Bot') return false
          let lookup = lookups.get(login)
          if (!lookup) {
            lookup = github.octokit.rest.repos
              .getCollaboratorPermissionLevel({ owner, repo, username: login })
              .then(({ data }) =>
                [data.permission, (data as { role_name?: string }).role_name].some(
                  (level) => !!level && WRITE_ACCESS.includes(level),
                ),
              )
              .catch((error) => {
                if ((error as { status?: number }).status !== 404)
                  console.error(`Pull request watcher could not check permission of ${login}`, error)
                return false
              })
            lookups.set(login, lookup)
          }
          return lookup
        }
        for (const watch of watches) {
          const pr = recent.get(watch.number)
          // ponytail: only the 300 most recently updated pull requests are seen; a busier repository needs pulls.get per watch.
          if (!pr) continue
          try {
            await checkWatch(github.octokit, owner, repo, watch, pr, trusted)
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
