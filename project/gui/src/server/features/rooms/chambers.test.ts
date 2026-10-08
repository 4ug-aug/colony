import { expect, test } from 'bun:test'
import { migratedDatabase } from '#/server/test-db'
import { feedbackTask, type PullRequestFeedback } from '#/server/features/pull-requests/feedback'
import type { WatchedPullRequest } from '#/server/features/pull-requests/watched-pull-request-store'
import type { RunControl } from '#/server/features/runs/run-control'
import { createChambers } from './chambers'
import { createRoomMessageHub } from './room-hub'
import { createSqliteRoomStore } from './room-store'

const watch: WatchedPullRequest = {
  repository: 'acme/app',
  number: 12,
  agentDefinitionId: 'engineer',
  responsibleAccountId: 'user-1',
  cursor: '',
  createdAt: 0,
  updatedAt: 0,
}
const feedback = (
  state: 'APPROVED' | 'CHANGES_REQUESTED',
  author = 'octo',
): PullRequestFeedback => ({
  repository: 'acme/app',
  number: 12,
  title: 'Add thing',
  url: 'https://github.com/acme/app/pull/12',
  headSha: 'abcdef1234',
  reviews: [{ author, state, body: '', inlineComments: 0, submittedAt: '' }],
  comments: [],
  failedChecks: [],
})

function setup() {
  const sqlite = migratedDatabase()
  sqlite.run(
    "INSERT INTO user (id, name, email, username) VALUES ('user-1', 'Ada', 'ada@example.com', 'ada')",
  )
  const store = createSqliteRoomStore(sqlite)
  const started: { task: string; requestedBy: string }[] = []
  const control = {
    start: (task: string, context: any) => {
      started.push({ task, requestedBy: context.responsibleAccountId })
      return context.onCreate({
        id: `run-${started.length}`,
        task,
        agentId: context.agentDefinitionId,
        provider: 'openai',
        model: 'm',
        state: 'running',
        createdAt: 1,
        stdout: '',
        stderr: '',
      })
    },
  } as unknown as RunControl
  const chambers = createChambers({
    store,
    messages: createRoomMessageHub(store),
    control,
    agent: (id) => ({ id, name: 'Engineer' }),
    onOpened: () => {},
  })
  const chamber = () => store.chamberFor('user-1', { id: 'engineer', name: 'Engineer' }).room
  return { store, started, chambers, chamber }
}

test('feedback needing action is posted as the account and starts a run', () => {
  const { store, started, chambers, chamber } = setup()
  const item = feedback('CHANGES_REQUESTED')
  expect(chambers.deliverPullRequestFeedback(watch, item)).toBe('delivered')
  const [message] = store.listMessages(chamber().id)
  expect(message).toMatchObject({
    author: { kind: 'user', id: 'user-1' },
    text: feedbackTask(item),
    delivery: { kind: 'pull_request_feedback', number: 12, reviewers: ['octo'] },
  })
  expect(message.queued).toBeUndefined()
  expect(started).toHaveLength(1)
  expect(started[0].requestedBy).toBe('user-1')
})

test('feedback is queued while the conversation has a run', () => {
  const { store, started, chambers, chamber } = setup()
  chambers.deliverPullRequestFeedback(watch, feedback('CHANGES_REQUESTED'))
  chambers.deliverPullRequestFeedback(watch, feedback('CHANGES_REQUESTED', 'mona'))
  const messages = store.listMessages(chamber().id)
  // Both land in the same millisecond, so their order is not fixed.
  expect(messages.filter((m) => m.queued)).toHaveLength(1)
  expect(messages).toHaveLength(2)
  expect(started).toHaveLength(1)
})

test('an approval alone is an agent message and starts no run', () => {
  const { store, started, chambers, chamber } = setup()
  chambers.deliverPullRequestFeedback(watch, feedback('APPROVED', 'x'))
  const [message] = store.listMessages(chamber().id)
  expect(message).toMatchObject({
    author: { kind: 'agent', id: 'engineer' },
    text: 'Pull request #12 was approved by @x.',
    delivery: { kind: 'pull_request_feedback', number: 12 },
  })
  expect(started).toHaveLength(0)
})
