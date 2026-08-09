import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  buildIssueRunTask,
  createSqliteIssueStore,
  formatIssueId,
  parseIssueRef,
  resolveIssue,
} from './issue-store'

const migration = [
  readFileSync(
    fileURLToPath(new URL('../../drizzle/0016_issues.sql', import.meta.url)),
    'utf8',
  ),
  readFileSync(
    fileURLToPath(
      new URL('../../drizzle/0017_issue_deliverable.sql', import.meta.url),
    ),
    'utf8',
  ),
  readFileSync(
    fileURLToPath(
      new URL('../../drizzle/0018_issue_run_steps.sql', import.meta.url),
    ),
    'utf8',
  ),
  readFileSync(
    fileURLToPath(
      new URL('../../drizzle/0024_issue_branch.sql', import.meta.url),
    ),
    'utf8',
  ),
].join('\n--> statement-breakpoint\n')

const applyMigration = (sqlite: Database) => {
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const statement of migration.split('--> statement-breakpoint')) {
    const sql = statement.trim()
    if (sql) sqlite.exec(sql)
  }
}

test('issue store allocates SWE numbers and tracks child progress', () => {
  const sqlite = new Database(':memory:')
  applyMigration(sqlite)
  const store = createSqliteIssueStore(sqlite)

  const parent = store.createIssue({
    id: 'parent',
    title: 'Ship dock badge',
    description: 'Parent feature',
    createdAt: 1,
  })
  expect(parent).toMatchObject({ number: 1, status: 'backlog', priority: 'none' })
  expect(formatIssueId(parent.number)).toBe('SWE-1')

  const childA = store.createIssue({
    id: 'child-a',
    title: 'UI badge',
    parentId: parent.id,
    createdAt: 2,
  })
  const childB = store.createIssue({
    id: 'child-b',
    title: 'Wire notifications',
    parentId: parent.id,
    status: 'done',
    createdAt: 3,
  })
  expect(childA.number).toBe(2)
  expect(childB.number).toBe(3)

  const listedParent = store.getIssue(parent.id)
  expect(listedParent?.childProgress).toEqual({ done: 1, total: 2 })

  store.assignIssue(childA.id, { kind: 'agent', id: 'software-engineer' }, 4)
  expect(store.getIssue(childA.id)?.owner).toEqual({
    kind: 'agent',
    id: 'software-engineer',
  })

  store.updateIssue(childA.id, { status: 'in_progress', tags: ['gui'] }, 5)
  expect(store.getIssue(childA.id)).toMatchObject({
    status: 'in_progress',
    tags: ['gui'],
  })

  expect(resolveIssue(store, 'SWE-2')?.id).toBe(childA.id)
  expect(parseIssueRef('swe-2')).toEqual({ kind: 'number', number: 2 })

  const task = buildIssueRunTask(store.getIssue(childA.id)!, parent)
  expect(task).toContain('SWE-2')
  expect(task).toContain('<<<issue')
  expect(task).toContain('untrusted user/agent-authored data')
  expect(task).toContain('SWE-1')
  expect(task).toContain('Parent feature')

  const parentTask = buildIssueRunTask(
    store.getIssue(parent.id)!,
    undefined,
    store.listChildIssues(parent.id),
  )
  expect(parentTask).toContain('<<<children')
  expect(parentTask).toContain('SWE-2')
  expect(parentTask).toContain('SWE-3')

  store.setDeliverable(parent.id, 'Shipped the badge.', 8)
  expect(store.getIssue(parent.id)?.deliverable).toBe('Shipped the badge.')
  expect(store.hasActiveRun(childA.id)).toBe(false)
  expect(
    store.createRun({
      id: 'run-1',
      issueId: childA.id,
      task,
      agentId: 'software-engineer',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      state: 'preparing',
      createdAt: 6,
      stdout: '',
      stderr: '',
    })?.id,
  ).toBe('run-1')
  expect(
    store.createRun({
      id: 'run-2',
      issueId: childA.id,
      task,
      agentId: 'software-engineer',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      state: 'preparing',
      createdAt: 7,
      stdout: '',
      stderr: '',
    }),
  ).toBeUndefined()
  expect(store.listRuns(childA.id)).toHaveLength(1)
  store.appendStep({
    id: 'step-1',
    runId: 'run-1',
    idx: 0,
    kind: 'message',
    text: 'Looking at the badge',
    createdAt: 8,
    at: 8,
  })
  store.appendStep({
    id: 'step-2',
    runId: 'run-1',
    idx: 1,
    kind: 'tool_call',
    tool: 'shell',
    callId: 'call-1',
    text: '{"command":"ls"}',
    createdAt: 9,
    at: 9,
  })
  expect(store.listSteps('run-1').map((step) => step.id)).toEqual([
    'step-1',
    'step-2',
  ])
  expect(store.listSteps('missing')).toEqual([])
  sqlite.close()
})

test('deleteIssue removes the issue, cascades runs, and orphans children', () => {
  const sqlite = new Database(':memory:')
  applyMigration(sqlite)
  const store = createSqliteIssueStore(sqlite)
  const parent = store.createIssue({
    id: 'parent',
    title: 'Parent',
    createdAt: 1,
  })
  const child = store.createIssue({
    id: 'child',
    title: 'Child',
    parentId: parent.id,
    createdAt: 2,
  })
  store.createRun({
    id: 'run-1',
    issueId: parent.id,
    task: 'task',
    agentId: 'software-engineer',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    state: 'succeeded',
    createdAt: 3,
    stdout: '',
    stderr: '',
  })

  expect(store.deleteIssue(parent.id)).toBe(true)
  expect(store.getIssue(parent.id)).toBeUndefined()
  expect(store.listRuns(parent.id)).toHaveLength(0)
  expect(store.getIssue(child.id)?.id).toBe(child.id)
  expect(store.getIssue(child.id)?.parentId).toBeUndefined()
  expect(store.deleteIssue(parent.id)).toBe(false)
  sqlite.close()
})

test('issue store rejects parent cycles and oversized descriptions', () => {
  const sqlite = new Database(':memory:')
  applyMigration(sqlite)
  const store = createSqliteIssueStore(sqlite)
  const a = store.createIssue({ id: 'a', title: 'A', createdAt: 1 })
  const b = store.createIssue({
    id: 'b',
    title: 'B',
    parentId: a.id,
    createdAt: 2,
  })
  expect(() =>
    store.updateIssue(a.id, { parentId: b.id }, 3),
  ).toThrow('Issue parent cycle')
  expect(() =>
    store.createIssue({
      id: 'huge',
      title: 'Huge',
      description: 'x'.repeat(10_001),
      createdAt: 4,
    }),
  ).toThrow('Invalid Issue description')
  sqlite.close()
})

test('issue branch binding resolves own and inherited effectiveBranch', () => {
  const sqlite = new Database(':memory:')
  applyMigration(sqlite)
  const store = createSqliteIssueStore(sqlite, 'acme/widgets')

  const parent = store.createIssue({
    id: 'parent',
    title: 'Parent',
    createdAt: 1,
  })
  store.updateIssue(parent.id, { branch: 'feat/parent' }, 2)
  expect(store.getIssue(parent.id)).toMatchObject({
    branch: 'feat/parent',
    effectiveBranch: 'feat/parent',
    branchUrl: 'https://github.com/acme/widgets/tree/feat/parent',
  })

  const child = store.createIssue({
    id: 'child',
    title: 'Child',
    parentId: parent.id,
    createdAt: 3,
  })
  expect(store.getIssue(child.id)).toMatchObject({
    effectiveBranch: 'feat/parent',
  })
  expect(store.getIssue(child.id)?.branch).toBeUndefined()

  store.updateIssue(child.id, { branch: 'feat/child' }, 4)
  expect(store.getIssue(child.id)).toMatchObject({
    branch: 'feat/child',
    effectiveBranch: 'feat/child',
  })

  const middle = store.createIssue({
    id: 'middle',
    title: 'Middle',
    parentId: parent.id,
    createdAt: 5,
  })
  const grandchild = store.createIssue({
    id: 'grandchild',
    title: 'Grandchild',
    parentId: middle.id,
    createdAt: 6,
  })
  expect(store.getIssue(grandchild.id)?.effectiveBranch).toBe('feat/parent')

  store.updateIssue(child.id, { branch: null }, 7)
  expect(store.getIssue(child.id)?.branch).toBeUndefined()
  expect(store.getIssue(child.id)?.effectiveBranch).toBe('feat/parent')

  store.updateIssue(middle.id, { branch: 'feat/x' }, 8)
  expect(store.getIssue(middle.id)).toMatchObject({
    branch: 'feat/x',
    effectiveBranch: 'feat/x',
  })

  sqlite.close()
})
