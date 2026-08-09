import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createSqliteGrillStore } from './grill-store'
import { createGrillsHttp } from './grills-http'
import type { RoomUser } from './room-store'

const schema = `
  CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, image TEXT);
  INSERT INTO user VALUES ('ada', 'Ada', NULL);
  INSERT INTO user VALUES ('grace', 'Grace', NULL);
  CREATE TABLE grill (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('code', 'general')),
    visibility TEXT NOT NULL CHECK (visibility IN ('invite-only', 'workspace-open')),
    agent_definition_id TEXT NOT NULL,
    repository TEXT,
    base_ref TEXT,
    frontier TEXT NOT NULL DEFAULT '{"questions":[],"drafts":{}}',
    settled_answers TEXT NOT NULL DEFAULT '[]',
    draft_artifacts TEXT,
    created_by TEXT NOT NULL REFERENCES user(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE grill_participant (
    grill_id TEXT NOT NULL REFERENCES grill(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES user(id),
    PRIMARY KEY (grill_id, user_id)
  );
  CREATE TABLE grill_attention (
    id TEXT PRIMARY KEY NOT NULL,
    grill_id TEXT NOT NULL REFERENCES grill(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('grill_invite')),
    source_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    acknowledged_at INTEGER,
    UNIQUE(recipient_id, kind, source_id)
  );
`

const ada: RoomUser = { id: 'ada', name: 'Ada' }
const grace: RoomUser = { id: 'grace', name: 'Grace' }

function harness(
  hasGuidanceSkill = true,
  opts?: {
    createIssue?: Parameters<typeof createSqliteGrillStore>[1]['createIssue']
    createDoc?: Parameters<typeof createSqliteGrillStore>[1]['createDoc']
    materializeCodeGrill?: Parameters<
      typeof createSqliteGrillStore
    >[1]['materializeCodeGrill']
    setIssueBranch?: Parameters<
      typeof createSqliteGrillStore
    >[1]['setIssueBranch']
  },
) {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(schema)
  const grillStore = createSqliteGrillStore(sqlite, {
    hasGuidanceSkill: () => hasGuidanceSkill,
    defaultRepository: 'acme/sweat',
    defaultBaseRef: 'main',
    ...(opts?.createIssue ? { createIssue: opts.createIssue } : {}),
    ...(opts?.createDoc ? { createDoc: opts.createDoc } : {}),
    ...(opts?.materializeCodeGrill
      ? { materializeCodeGrill: opts.materializeCodeGrill }
      : {}),
    ...(opts?.setIssueBranch ? { setIssueBranch: opts.setIssueBranch } : {}),
  })
  const handle = createGrillsHttp({ grillStore })
  const call = async (
    user: RoomUser,
    method: string,
    path: string,
    body?: unknown,
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
  return { call, grillStore, sqlite }
}

test('POST creates Grill; rejects missing guidance skill', async () => {
  const ok = harness(true)
  const created = await ok.call(ada, 'POST', '/api/grills', {
    kind: 'code',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    baseRef: 'develop',
  })
  expect(created.status).toBe(201)
  expect(created.body.grill).toMatchObject({
    kind: 'code',
    repository: 'acme/sweat',
    baseRef: 'develop',
  })

  const blocked = harness(false)
  const rejected = await blocked.call(ada, 'POST', '/api/grills', {
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
  })
  expect(rejected.status).toBe(400)
  expect(rejected.body.error).toContain('attached Skill')
  ok.sqlite.close()
  blocked.sqlite.close()
})

test('invite-only Grill is hidden until participant; DELETE hard-discards', async () => {
  const { call, grillStore, sqlite } = harness()
  const created = await call(ada, 'POST', '/api/grills', {
    kind: 'general',
    visibility: 'invite-only',
    agentDefinitionId: 'interviewer',
  })
  const id = created.body.grill.id as string

  expect((await call(grace, 'GET', `/api/grills/${id}`)).status).toBe(404)
  grillStore.addParticipant(id, 'grace')
  expect((await call(grace, 'GET', `/api/grills/${id}`)).status).toBe(200)

  expect((await call(ada, 'DELETE', `/api/grills/${id}`)).status).toBe(200)
  expect((await call(ada, 'GET', `/api/grills/${id}`)).status).toBe(404)
  sqlite.close()
})

test('POST invite creates Attention; acknowledge clears badge', async () => {
  const { call, grillStore, sqlite } = harness()
  const created = await call(ada, 'POST', '/api/grills', {
    kind: 'general',
    visibility: 'invite-only',
    agentDefinitionId: 'interviewer',
  })
  const id = created.body.grill.id as string

  const invited = await call(ada, 'POST', `/api/grills/${id}/invite`, {
    userId: 'grace',
  })
  expect(invited.status).toBe(200)
  expect(invited.body).toMatchObject({ grillId: id, attentionCount: 1 })
  expect((await call(grace, 'GET', `/api/grills/${id}`)).status).toBe(200)
  expect(grillStore.listGrillAttentionCounts('grace').get(id)).toBe(1)

  const acked = await call(
    grace,
    'POST',
    `/api/grills/${id}/attention/acknowledge`,
  )
  expect(acked.status).toBe(200)
  expect(acked.body).toMatchObject({ grillId: id, attentionCount: 0 })
  expect(grillStore.listGrillAttentionCounts('grace').size).toBe(0)
  sqlite.close()
})

test('Accounts can push back or confirm an Issue proposal', async () => {
  const minted: string[] = []
  const { call, grillStore, sqlite } = harness(true, {
    createIssue: (input) => {
      minted.push(input.title)
      return { id: input.id }
    },
  })
  const created = await call(ada, 'POST', '/api/grills', {
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
  })
  const id = created.body.grill.id as string
  grillStore.setIssueProposal(
    id,
    [
      { key: 'root', title: 'Parent', description: 'P' },
      { key: 'child', title: 'Child', parentKey: 'root' },
    ],
    Date.now(),
  )

  const pushed = await call(ada, 'POST', `/api/grills/${id}/proposal/push-back`, {
    notes: 'Need a third leaf',
  })
  expect(pushed.status).toBe(200)
  expect(pushed.body.grill.issueProposal).toMatchObject({
    status: 'revision_requested',
    revisionNotes: 'Need a third leaf',
  })

  grillStore.setIssueProposal(
    id,
    [
      { key: 'root', title: 'Parent', description: 'P' },
      { key: 'a', title: 'Leaf A', parentKey: 'root' },
      { key: 'b', title: 'Leaf B', parentKey: 'root' },
    ],
    Date.now(),
  )

  const confirmed = await call(
    ada,
    'POST',
    `/api/grills/${id}/proposal/confirm`,
  )
  expect(confirmed.status).toBe(200)
  expect(confirmed.body.grill.issueProposal.status).toBe('confirmed')
  expect(confirmed.body.issues.map((issue: { title: string }) => issue.title)).toEqual([
    'Parent',
    'Leaf A',
    'Leaf B',
  ])
  expect(minted).toEqual(['Parent', 'Leaf A', 'Leaf B'])
  sqlite.close()
})

test('Code Grill confirm materializes before creating branch-bound Issues', async () => {
  const events: string[] = []
  const { call, grillStore, sqlite } = harness(true, {
    materializeCodeGrill: async (input) => {
      events.push(`materialize:${input.files[0]?.path}`)
      return { branch: input.branch }
    },
    createIssue: (input) => {
      events.push(`create:${input.title}`)
      return { id: input.id }
    },
    setIssueBranch: (_id, branch) => {
      events.push(`branch:${branch}`)
    },
  })
  const created = await call(ada, 'POST', '/api/grills', {
    kind: 'code',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
  })
  const id = created.body.grill.id as string
  grillStore.setIssueProposal(
    id,
    [
      { key: 'root', title: 'Initiative' },
      { key: 'child', title: 'Child', parentKey: 'root' },
    ],
    Date.now(),
    [{ path: 'CONTEXT.md', content: '# Decisions\n' }],
  )

  const confirmed = await call(
    ada,
    'POST',
    `/api/grills/${id}/proposal/confirm`,
  )

  expect(confirmed.status).toBe(200)
  expect(confirmed.body.grill.sessionBranch).toBe(`sweat/grill/${id}`)
  expect(events).toEqual([
    'materialize:CONTEXT.md',
    'create:Initiative',
    'create:Child',
    `branch:sweat/grill/${id}`,
  ])
  sqlite.close()
})

test('POST /api/grills/:id/complete persists General Grill Doc', async () => {
  const docs: Array<{ title: string; body: string }> = []
  const { call, sqlite } = harness(true, {
    createDoc: (doc) => {
      docs.push({ title: doc.title, body: doc.body })
      return doc
    },
  })
  const created = await call(ada, 'POST', '/api/grills', {
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
  })
  const id = created.body.grill.id as string
  const completed = await call(ada, 'POST', `/api/grills/${id}/complete`, {
    title: 'Writeup',
    body: '# Done\n',
  })
  expect(completed.status).toBe(200)
  expect(typeof completed.body.grill.docId).toBe('string')
  expect(docs).toEqual([{ title: 'Writeup', body: '# Done\n' }])
  sqlite.close()
})

test('GET /api/grills includes linked-run activity when present', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(schema)
  const grillStore = createSqliteGrillStore(sqlite, {
    hasGuidanceSkill: () => true,
    defaultRepository: 'acme/sweat',
    defaultBaseRef: 'main',
  })
  const linkedRun = {
    id: 'run-1',
    task: 'grill',
    state: 'running',
    agentId: 'interviewer',
    provider: 'openai',
    model: 'gpt',
    createdAt: 1,
  }
  const latestStep = {
    kind: 'message' as const,
    text: 'asking a question',
    at: 2,
  }
  const handle = createGrillsHttp({
    grillStore,
    linkedRuns: {
      start: () => linkedRun,
      followUp: async () => linkedRun,
      dispose: async () => undefined,
      getLinkedRun: (grillId) => (grillId === 'g1' ? linkedRun : undefined),
      getLatestStep: (grillId) => (grillId === 'g1' ? latestStep : undefined),
    },
  })
  grillStore.createGrill({
    id: 'g1',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    initialRequest: 'We are testing!',
    createdBy: 'ada',
    createdAt: 1,
  })
  const url = new URL('http://localhost/api/grills')
  const response = await handle(new Request(url), url, ada)
  expect(response?.status).toBe(200)
  const body = (await response!.json()) as {
    grills: Array<Record<string, unknown>>
  }
  expect(body.grills).toHaveLength(1)
  expect(body.grills[0]).toMatchObject({
    id: 'g1',
    linkedRun: { id: 'run-1', state: 'running' },
    latestStep: { text: 'asking a question' },
  })
  sqlite.close()
})

test('POST /api/grills/:id/reply follows up when frontier is empty', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(schema)
  const grillStore = createSqliteGrillStore(sqlite, {
    hasGuidanceSkill: () => true,
    defaultRepository: 'acme/sweat',
    defaultBaseRef: 'main',
    createDoc: (doc) => doc,
  })
  const followUps: Array<{ grillId: string; task: string }> = []
  const handle = createGrillsHttp({
    grillStore,
    linkedRuns: {
      start: () => undefined,
      followUp: async (grillId, task) => {
        followUps.push({ grillId, task })
        return undefined
      },
      dispose: async () => undefined,
    },
  })
  const grill = grillStore.createGrill({
    id: 'g-reply',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    initialRequest: 'Grill the auth redesign',
    createdBy: 'ada',
    createdAt: 1,
  })

  const okUrl = new URL(`http://localhost/api/grills/${grill.id}/reply`)
  const okResponse = await handle(
    new Request(okUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '  Put the rocket in the title  ' }),
    }),
    okUrl,
    ada,
  )
  expect(okResponse?.status).toBe(200)
  expect(followUps).toHaveLength(1)
  expect(followUps[0]!.grillId).toBe(grill.id)
  expect(followUps[0]!.task).toContain(
    JSON.stringify({
      type: 'grill.account_reply',
      message: 'Put the rocket in the title',
    }),
  )
  expect(followUps[0]!.task).toContain(
    'HARD RULE — Grill questions are tools, never chat',
  )

  const emptyResponse = await handle(
    new Request(okUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    }),
    okUrl,
    ada,
  )
  expect(emptyResponse?.status).toBe(400)

  grillStore.setFrontier(
    grill.id,
    {
      questions: [{ id: 'q1', prompt: 'Open question?' }],
      drafts: {},
    },
    2,
  )
  const frontierResponse = await handle(
    new Request(okUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Should fail' }),
    }),
    okUrl,
    ada,
  )
  expect(frontierResponse?.status).toBe(400)
  expect(((await frontierResponse!.json()) as { error: string }).error).toContain(
    'frontier is empty',
  )

  grillStore.setFrontier(grill.id, { questions: [], drafts: {} }, 3)
  grillStore.setWriteup(grill.id, { title: 'Decisions', body: '# Done\n' }, 4)
  const wrapUpResponse = await handle(
    new Request(okUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'During wrap-up' }),
    }),
    okUrl,
    ada,
  )
  expect(wrapUpResponse?.status).toBe(400)
  expect(((await wrapUpResponse!.json()) as { error: string }).error).toContain(
    'wrap-up',
  )

  await grillStore.completeGrill(
    grill.id,
    { title: 'Decisions', body: '# Done\n' },
    5,
  )
  const completeResponse = await handle(
    new Request(okUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'After complete' }),
    }),
    okUrl,
    ada,
  )
  expect(completeResponse?.status).toBe(400)
  expect(((await completeResponse!.json()) as { error: string }).error).toContain(
    'complete',
  )

  sqlite.close()
})

test('POST /run appends the Grill turn contract so questions must use tools', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(schema)
  const grillStore = createSqliteGrillStore(sqlite, {
    hasGuidanceSkill: () => true,
    defaultRepository: 'acme/sweat',
    defaultBaseRef: 'main',
  })
  const starts: Array<{ task: string }> = []
  const handle = createGrillsHttp({
    grillStore,
    linkedRuns: {
      start: (input) => {
        starts.push({ task: input.task })
        return {
          id: 'run-1',
          task: input.task,
          state: 'preparing',
          agentId: input.agentDefinitionId,
          provider: 'openai',
          model: 'gpt',
          createdAt: 1,
        }
      },
      followUp: async () => undefined,
      dispose: async () => undefined,
    },
  })
  const grill = grillStore.createGrill({
    id: 'g1',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    initialRequest: 'Grill the auth redesign',
    createdBy: 'ada',
    createdAt: 1,
  })
  const url = new URL(`http://localhost/api/grills/${grill.id}/run`)
  const response = await handle(
    new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'Grill the auth redesign' }),
    }),
    url,
    ada,
  )
  expect(response?.status).toBe(201)
  expect(starts).toHaveLength(1)
  expect(starts[0]!.task).toContain('Grill the auth redesign')
  expect(starts[0]!.task).toContain('HARD RULE — Grill questions are tools, never chat')
  expect(starts[0]!.task).toContain('workspace.set_grill_frontier')
  expect(starts[0]!.task).toContain(
    'The only granted MCP tools are workspace.set_grill_frontier',
  )
  sqlite.close()
})
