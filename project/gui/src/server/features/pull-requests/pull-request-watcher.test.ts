import { migratedDatabase } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { Octokit } from 'octokit'
import type { PullRequestFeedback } from './feedback'
import { createPullRequestWatcher } from './pull-request-watcher'
import { createWatchedPullRequestStore } from './watched-pull-request-store'

const T0 = Date.parse('2026-01-01T00:00:00Z')
const iso = (offsetMinutes: number) =>
  new Date(T0 + offsetMinutes * 60_000).toISOString().replace('.000', '')

function setup(options: { deliver?: 'delivered' | 'deferred' } = {}) {
  const github = {
    pr: {
      number: 7,
      state: 'open',
      title: 'Add widgets',
      html_url: 'https://github.com/acme/widgets/pull/7',
      updated_at: iso(1),
      head: { sha: 'sha1' },
    },
    reviews: [] as unknown[],
    reviewComments: [] as unknown[],
    comments: [] as unknown[],
    runs: [{ name: 'ci', status: 'completed', conclusion: 'success', output: {} }] as unknown[],
    reactionStatus: 200,
    checksStatus: 200,
    permissions: { grace: 'write' } as Record<string, string>,
  }
  const reactions: { path: string; body: unknown }[] = []
  const calls: string[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    calls.push(path)
    if (path.endsWith('/reactions')) {
      reactions.push({ path, body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ id: 1 }), {
        status: github.reactionStatus,
        headers: { 'content-type': 'application/json' },
      })
    }
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
      })
    const collaborator = path.match(/\/collaborators\/([^/]+)\/permission$/)
    if (collaborator) {
      const permission = github.permissions[collaborator[1]]
      return permission
        ? json({ permission, user: { login: collaborator[1] } })
        : new Response(JSON.stringify({ message: 'Not Found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          })
    }
    if (path.endsWith('/pulls')) return json([github.pr])
    if (path.endsWith('/reviews')) return json(github.reviews)
    if (path.endsWith('/pulls/7/comments')) return json(github.reviewComments)
    if (path.endsWith('/issues/7/comments')) return json(github.comments)
    if (path.includes('/check-runs') && github.checksStatus !== 200)
      return new Response(JSON.stringify({ message: 'Resource not accessible by integration' }), {
        status: github.checksStatus,
        headers: { 'content-type': 'application/json' },
      })
    if (path.includes('/check-runs'))
      return json({ total_count: github.runs.length, check_runs: github.runs })
    throw new Error(`unexpected ${path}`)
  }) as typeof globalThis.fetch
  const store = createWatchedPullRequestStore(migratedDatabase())
  store.record({
    repository: 'acme/widgets',
    number: 7,
    agentDefinitionId: 'engineer',
    responsibleAccountId: 'ada',
    now: T0,
  })
  const delivered: PullRequestFeedback[] = []
  let outcome = options.deliver ?? 'delivered'
  const config = {
    octokit: new Octokit({ request: { fetch } }),
    repository: 'acme/widgets',
  } as const
  const watcher = createPullRequestWatcher({
    github: () => (enabled ? config : undefined),
    store,
    deliver: (_watch, feedback) => {
      if (outcome === 'delivered') delivered.push(feedback)
      return outcome
    },
    now: () => T0 + 60 * 60_000,
  })
  let enabled = true
  return {
    github,
    calls,
    reactions,
    store,
    delivered,
    watcher,
    setOutcome: (next: 'delivered' | 'deferred') => (outcome = next),
    disable: () => (enabled = false),
    count: (suffix: string) => calls.filter((c) => c.endsWith(suffix)).length,
  }
}

const review = (extra: object = {}) => ({
  id: 100,
  state: 'CHANGES_REQUESTED',
  body: 'Please rename',
  submitted_at: iso(1),
  user: { login: 'grace', type: 'User' },
  author_association: 'MEMBER',
  ...extra,
})

test('a new review is delivered once with its inline comment count', async () => {
  const t = setup()
  t.github.reviews = [review()]
  t.github.reviewComments = [{ pull_request_review_id: 100 }, { pull_request_review_id: 100 }]
  await t.watcher.tick()
  expect(t.delivered).toHaveLength(1)
  expect(t.delivered[0].reviews).toEqual([
    {
      author: 'grace',
      state: 'CHANGES_REQUESTED',
      body: 'Please rename',
      inlineComments: 2,
      submittedAt: iso(1),
    },
  ])
  await t.watcher.tick()
  expect(t.delivered).toHaveLength(1)
})

test('bot and outside comments are ignored and not refetched', async () => {
  const t = setup()
  t.github.comments = [
    { body: 'build', created_at: iso(1), user: { login: 'ci', type: 'Bot' }, author_association: 'MEMBER' },
    { body: 'hi', created_at: iso(1), user: { login: 'eve', type: 'User' }, author_association: 'NONE' },
  ]
  await t.watcher.tick()
  expect(t.delivered).toHaveLength(0)
  expect(t.count('/reviews')).toBe(1)
  await t.watcher.tick()
  expect(t.count('/reviews')).toBe(1)
})

test('a deferred delivery is retried on the next tick', async () => {
  const t = setup({ deliver: 'deferred' })
  t.github.reviews = [review()]
  await t.watcher.tick()
  expect(t.delivered).toHaveLength(0)
  t.setOutcome('delivered')
  await t.watcher.tick()
  expect(t.delivered).toHaveLength(1)
})

test('a failed check is delivered once, a passing one is settled silently', async () => {
  const t = setup()
  t.github.runs = [
    { name: 'ci', status: 'completed', conclusion: 'failure', output: { title: '2 tests failed' } },
  ]
  await t.watcher.tick()
  expect(t.delivered[0].failedChecks).toEqual([
    { name: 'ci', conclusion: 'failure', title: '2 tests failed' },
  ])
  await t.watcher.tick()
  expect(t.delivered).toHaveLength(1)

  const passing = setup()
  await passing.watcher.tick()
  expect(passing.delivered).toHaveLength(0)
  expect(passing.store.list()[0].checkedSha).toBe('sha1')
})

test('an in-progress check is looked at again next tick', async () => {
  const t = setup()
  t.github.runs = [{ name: 'ci', status: 'in_progress', conclusion: null, output: {} }]
  await t.watcher.tick()
  expect(t.store.list()[0].checkedSha).toBeUndefined()
  t.github.runs = [{ name: 'ci', status: 'completed', conclusion: 'timed_out', output: {} }]
  await t.watcher.tick()
  expect(t.delivered).toHaveLength(1)
})

test('a closed pull request stops being watched', async () => {
  const t = setup()
  t.github.pr.state = 'closed'
  t.github.reviews = [review()]
  await t.watcher.tick()
  expect(t.store.list()).toEqual([])
  expect(t.delivered).toHaveLength(0)
})

test('nothing is requested while GitHub is not configured', async () => {
  const t = setup()
  t.disable()
  await t.watcher.tick()
  expect(t.calls).toEqual([])
})

const eyes = { content: 'eyes' }
const inlineComment = (id: number, reviewId: number) => ({ id, pull_request_review_id: reviewId })
const prComment = (id: number, extra: object = {}) => ({
  id,
  body: 'hi',
  created_at: iso(1),
  user: { login: 'grace', type: 'User' },
  author_association: 'MEMBER',
  ...extra,
})

test('delivered feedback gets an eyes reaction on its comments', async () => {
  const t = setup()
  t.github.reviews = [review()]
  t.github.reviewComments = [inlineComment(11, 100), inlineComment(12, 100), inlineComment(13, 999)]
  t.github.comments = [prComment(21)]
  await t.watcher.tick()
  expect(t.reactions.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
    { path: '/repos/acme/widgets/issues/comments/21/reactions', body: eyes },
    { path: '/repos/acme/widgets/pulls/comments/11/reactions', body: eyes },
    { path: '/repos/acme/widgets/pulls/comments/12/reactions', body: eyes },
  ])
})

test('a deferred delivery reacts only once it is delivered', async () => {
  const t = setup({ deliver: 'deferred' })
  t.github.comments = [prComment(21)]
  await t.watcher.tick()
  expect(t.reactions).toEqual([])
  t.setOutcome('delivered')
  await t.watcher.tick()
  expect(t.reactions).toHaveLength(1)
})

test('a failing reaction does not hold back the cursor', async () => {
  const t = setup()
  t.github.reactionStatus = 403
  t.github.comments = [prComment(21)]
  await t.watcher.tick()
  expect(t.delivered).toHaveLength(1)
  await t.watcher.tick()
  expect(t.delivered).toHaveLength(1)
})

test('undelivered bot and outside comments get no reaction', async () => {
  const t = setup()
  t.github.comments = [
    prComment(21, { user: { login: 'ci', type: 'Bot' } }),
    prComment(22, { user: { login: 'eve', type: 'User' }, author_association: 'NONE' }),
  ]
  await t.watcher.tick()
  expect(t.reactions).toEqual([])
})

test('without Checks permission reviews are still delivered and checks retried once granted', async () => {
  const t = setup()
  const logged = console.error
  const errors: unknown[][] = []
  console.error = (...args: unknown[]) => void errors.push(args)
  try {
    t.github.checksStatus = 403
    t.github.reviews = [review()]
    t.github.reviewComments = [inlineComment(11, 100)]
    await t.watcher.tick()
    expect(t.delivered).toHaveLength(1)
    expect(t.delivered[0].failedChecks).toEqual([])
    expect(t.reactions).toEqual([
      { path: '/repos/acme/widgets/pulls/comments/11/reactions', body: eyes },
    ])
    expect(t.store.list()[0].checkedSha).toBeUndefined()
    await t.watcher.tick()
    expect(errors).toHaveLength(1)
    expect(String(errors[0][0])).toContain('Checks: read')

    t.github.checksStatus = 200
    t.github.runs = [{ name: 'ci', status: 'completed', conclusion: 'failure', output: {} }]
    await t.watcher.tick()
    expect(t.delivered).toHaveLength(2)
    expect(t.delivered[1].failedChecks).toHaveLength(1)
  } finally {
    console.error = logged
  }
})

test('trust follows repository permission, not author association, and is cached per tick', async () => {
  const t = setup()
  t.github.permissions = { grace: 'write', ro: 'read' }
  t.github.reviews = [review({ author_association: 'CONTRIBUTOR' })]
  t.github.comments = [
    prComment(21, { author_association: 'CONTRIBUTOR' }),
    prComment(22, { author_association: 'MEMBER', user: { login: 'ro', type: 'User' } }),
  ]
  await t.watcher.tick()
  expect(t.delivered).toHaveLength(1)
  expect(t.delivered[0].reviews).toHaveLength(1)
  expect(t.delivered[0].comments.map((c) => c.author)).toEqual(['grace'])
  expect(t.calls.filter((c) => c.endsWith('/grace/permission'))).toHaveLength(1)
})
