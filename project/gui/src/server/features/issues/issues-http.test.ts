import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSqliteIssueStore } from './issue-store'
import { createIssueRunner } from './issue-runner'
import { createIssuesHttp } from './issues-http'
import type { RunControl, RunSummary } from '#/server/features/runs/run-control'
import type {
  AgentDefinitionSummary,
  WorkspaceServerMessage,
} from '#/server/coordinator'
import type { RoomUser } from '#/server/features/rooms/room-store'

const migration = [
  readFileSync(
    fileURLToPath(new URL('../../../../drizzle/0016_issues.sql', import.meta.url)),
    'utf8',
  ),
  readFileSync(
    fileURLToPath(
      new URL('../../../../drizzle/0017_issue_deliverable.sql', import.meta.url),
    ),
    'utf8',
  ),
  readFileSync(
    fileURLToPath(
      new URL('../../../../drizzle/0018_issue_run_steps.sql', import.meta.url),
    ),
    'utf8',
  ),
  readFileSync(
    fileURLToPath(
      new URL('../../../../drizzle/0024_issue_branch.sql', import.meta.url),
    ),
    'utf8',
  ),
  readFileSync(
    fileURLToPath(
      new URL('../../../../drizzle/0029_issue_created_by.sql', import.meta.url),
    ),
    'utf8',
  ),
].join('\n--> statement-breakpoint\n')

const ada: RoomUser = { id: 'ada', name: 'Ada' }

function harness() {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const statement of migration.split('--> statement-breakpoint')) {
    const sql = statement.trim()
    if (sql) sqlite.exec(sql)
  }
  const issueStore = createSqliteIssueStore(sqlite)
  const broadcasts: WorkspaceServerMessage[] = []
  const issueRunner = createIssueRunner({
    store: issueStore,
    control: {
      subscribe: () => () => {},
      subscribeSteps: () => () => {},
      getRun: () => undefined,
      start: (task, context) => {
        const summary = {
          id: crypto.randomUUID(),
          task,
          state: 'preparing',
          createdAt: Date.now(),
          stdout: '',
          stderr: '',
          agentId: context.agentDefinitionId ?? 'software-engineer',
          provider: 'openai',
          model: '',
        } satisfies RunSummary
        return context.onCreate(summary)
      },
      followUp: async () => undefined,
      cancel: async () => undefined,
      stop: async () => {},
    } satisfies RunControl,
  })
  const handle = createIssuesHttp({
    issueStore,
    issueRunner,
    agentDefinitions: () =>
      [
        { id: 'software-engineer', name: 'Software engineer' },
        { id: 'antboy', name: 'Antboy' },
      ] as AgentDefinitionSummary[],
    listWorkspaceUsers: () => [ada],
    broadcastWorkspace: (message) => broadcasts.push(message),
  })

  const call = async (
    method: string,
    path: string,
    body?: unknown,
    user: RoomUser = ada,
  ) => {
    const url = new URL(`http://localhost${path}`)
    const request = new Request(url, {
      method,
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { 'content-type': 'application/json' },
          }),
    })
    const response = await handle(request, url, user)
    if (!response) throw new Error(`unrouted: ${method} ${path}`)
    return {
      status: response.status,
      body: (await response.json()) as Record<string, any>,
    }
  }

  return { call, broadcasts, issueStore }
}

test('creating an Issue stamps the authenticated account as createdBy', async () => {
  const { call } = harness()

  const created = await call('POST', '/api/issues', {
    title: 'Dock badge',
    createdBy: { kind: 'agent', id: 'software-engineer' },
  })
  expect(created.status).toBe(201)
  expect(created.body.issue).toMatchObject({
    title: 'Dock badge',
    createdBy: { kind: 'account', id: 'ada' },
  })

  const listed = await call('GET', '/api/issues')
  expect(listed.body.issues[0].createdBy).toEqual({
    kind: 'account',
    id: 'ada',
  })
})

test('child assign, create, and start run while the parent run is active', async () => {
  const { call } = harness()

  const parent = await call('POST', '/api/issues', {
    title: 'Add auth',
    owner: { kind: 'agent', id: 'antboy' },
  })
  expect(parent.status).toBe(201)
  expect(parent.body.run?.agentId).toBe('antboy')
  const parentId = parent.body.issue.id as string

  const created = await call('POST', '/api/issues', {
    title: 'Login UI',
    parentId,
    owner: { kind: 'agent', id: 'software-engineer' },
  })
  expect(created.status).toBe(201)
  expect(created.body.run?.agentId).toBe('software-engineer')
  expect(created.body.error).toBeUndefined()

  const sibling = await call('POST', '/api/issues', { title: 'Session API', parentId })
  expect(sibling.status).toBe(201)
  const assigned = await call('POST', `/api/issues/${sibling.body.issue.id}/assign`, {
    owner: { kind: 'agent', id: 'software-engineer' },
  })
  expect(assigned.status).toBe(200)
  expect(assigned.body.run?.agentId).toBe('software-engineer')

  const idle = await call('POST', '/api/issues', { title: 'Docs', parentId })
  const started = await call('POST', `/api/issues/${idle.body.issue.id}/runs`, {
    agentDefinitionId: 'software-engineer',
  })
  expect(started.status).toBe(202)
  expect(started.body.run?.agentId).toBe('software-engineer')

  const again = await call('POST', `/api/issues/${idle.body.issue.id}/runs`, {
    agentDefinitionId: 'software-engineer',
  })
  expect(again.status).toBe(409)
  expect(again.body.error).toBe('An Issue run is already active')

  const got = await call('GET', `/api/issues/${parentId}`)
  expect(got.body.issue.hasActiveRun).toBe(true)
  expect(got.body.issue.children).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: created.body.issue.id,
        hasActiveRun: true,
      }),
    ]),
  )
})

test('PATCH last child to In review starts a parent integrate run when the parent is idle', async () => {
  const { call, issueStore } = harness()
  const parent = await call('POST', '/api/issues', {
    title: 'Add auth',
    owner: { kind: 'agent', id: 'antboy' },
  })
  const dispatch = issueStore.listRuns(parent.body.issue.id)[0]!
  issueStore.updateRun({ ...dispatch, state: 'succeeded' })

  const ui = await call('POST', '/api/issues', {
    title: 'Login UI',
    parentId: parent.body.issue.id,
  })
  const api = await call('POST', '/api/issues', {
    title: 'Session API',
    parentId: parent.body.issue.id,
  })
  await call('PATCH', `/api/issues/${ui.body.issue.id}`, { status: 'in_review' })
  const last = await call('PATCH', `/api/issues/${api.body.issue.id}`, {
    status: 'done',
  })
  expect(last.status).toBe(200)
  const runs = await call('GET', `/api/issues/${parent.body.issue.id}/runs`)
  expect(runs.body.runs).toHaveLength(2)
})
