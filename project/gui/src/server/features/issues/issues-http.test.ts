import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSqliteIssueStore } from './issue-store'
import { createIssuesHttp } from './issues-http'
import type { WorkspaceServerMessage } from '#/server/coordinator'
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
  const handle = createIssuesHttp({
    issueStore,
    agentDefinitions: () => [],
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
