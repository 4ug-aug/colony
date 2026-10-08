import { expect, test } from 'bun:test'
import { IssueActiveRunError } from '#/server/features/issues/issue-runner'
import { feedbackTask, type PullRequestFeedback } from './feedback'
import { createFeedbackDelivery } from './feedback-delivery'
import type { WatchedPullRequest } from './watched-pull-request-store'

const feedback = (overrides: Partial<PullRequestFeedback> = {}): PullRequestFeedback => ({
  repository: 'o/r',
  number: 7,
  title: 'T',
  url: 'https://github.com/o/r/pull/7',
  headSha: 'abcdef123',
  reviews: [],
  comments: [{ author: 'a', body: 'fix', createdAt: '1' }],
  failedChecks: [],
  ...overrides,
})

const approval = feedback({
  comments: [],
  reviews: [
    { author: 'a', state: 'APPROVED', body: '', inlineComments: 0, submittedAt: '1' },
  ],
})

const watch = (overrides: Partial<WatchedPullRequest> = {}) =>
  ({ issueId: 'i1', agentDefinitionId: 'antboy', ...overrides }) as WatchedPullRequest

function setup(opts: { exists?: boolean; busy?: boolean } = {}) {
  const runs: unknown[] = []
  const chamber: unknown[] = []
  const deliver = createFeedbackDelivery({
    issueExists: () => opts.exists ?? true,
    startIssueRun: (id, options) => {
      if (opts.busy) throw new IssueActiveRunError()
      runs.push([id, options])
    },
    chamber: {
      deliverPullRequestFeedback: (w, f) => {
        chamber.push([w, f])
        return 'delivered'
      },
    },
  })
  return { deliver, runs, chamber }
}

test('Issue watch starts a run with the feedback task', () => {
  const { deliver, runs } = setup()
  expect(deliver(watch(), feedback())).toBe('delivered')
  expect(runs).toEqual([
    ['i1', { agentDefinitionId: 'antboy', feedback: feedbackTask(feedback()) }],
  ])
})

test('active Issue run defers', () => {
  expect(setup({ busy: true }).deliver(watch(), feedback())).toBe('deferred')
})

test('approval-only on an Issue watch starts nothing', () => {
  const { deliver, runs, chamber } = setup()
  expect(deliver(watch(), approval)).toBe('delivered')
  expect(runs).toHaveLength(0)
  expect(chamber).toHaveLength(0)
})

test('deleted Issue falls back to the Chamber', () => {
  const { deliver, runs, chamber } = setup({ exists: false })
  deliver(watch(), feedback())
  expect(runs).toHaveLength(0)
  expect(chamber).toHaveLength(1)
})

test('watch without an Issue goes to the Chamber', () => {
  const { deliver, chamber } = setup()
  deliver(watch({ issueId: undefined }), feedback())
  expect(chamber).toHaveLength(1)
})
