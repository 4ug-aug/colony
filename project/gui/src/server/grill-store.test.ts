import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createSqliteGrillStore } from './grill-store'

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

function harness(opts?: {
  hasGuidanceSkill?: (agentId: string) => boolean
  createIssue?: Parameters<typeof createSqliteGrillStore>[1]['createIssue']
  createDoc?: Parameters<typeof createSqliteGrillStore>[1]['createDoc']
  materializeCodeGrill?: Parameters<
    typeof createSqliteGrillStore
  >[1]['materializeCodeGrill']
  setIssueBranch?: Parameters<typeof createSqliteGrillStore>[1]['setIssueBranch']
}) {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(schema)
  const store = createSqliteGrillStore(sqlite, {
    hasGuidanceSkill: opts?.hasGuidanceSkill ?? (() => true),
    defaultRepository: 'acme/sweat',
    defaultBaseRef: 'main',
    ...(opts?.createIssue ? { createIssue: opts.createIssue } : {}),
    ...(opts?.createDoc ? { createDoc: opts.createDoc } : {}),
    ...(opts?.materializeCodeGrill
      ? { materializeCodeGrill: opts.materializeCodeGrill }
      : {}),
    ...(opts?.setIssueBranch ? { setIssueBranch: opts.setIssueBranch } : {}),
  })
  return { sqlite, store }
}

test('start rejects agent definitions without attached guidance skill', () => {
  const { store, sqlite } = harness({ hasGuidanceSkill: () => false })
  expect(() =>
    store.createGrill({
      id: 'g1',
      kind: 'general',
      visibility: 'workspace-open',
      agentDefinitionId: 'interviewer',
      createdBy: 'ada',
      createdAt: 10,
    }),
  ).toThrow('Grill requires an agent definition with an attached Skill')
  expect(store.listGrillsForUser('ada')).toHaveLength(0)
  sqlite.close()
})

test('create list get respects visibility; code grill binds repo + base ref', () => {
  const { store, sqlite } = harness()

  const open = store.createGrill({
    id: 'g-open',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 10,
  })
  expect(open).toMatchObject({
    id: 'g-open',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    frontier: { questions: [], drafts: {} },
    settledAnswers: [],
  })

  const invite = store.createGrill({
    id: 'g-invite',
    kind: 'code',
    visibility: 'invite-only',
    agentDefinitionId: 'interviewer',
    baseRef: 'develop',
    createdBy: 'ada',
    createdAt: 20,
  })
  expect(invite).toMatchObject({
    kind: 'code',
    repository: 'acme/sweat',
    baseRef: 'develop',
  })

  expect(store.listGrillsForUser('ada').map((g) => g.id).sort()).toEqual([
    'g-invite',
    'g-open',
  ])
  // Grace sees workspace-open only until invited.
  expect(store.listGrillsForUser('grace').map((g) => g.id)).toEqual(['g-open'])
  expect(store.getGrillForUser('g-invite', 'grace')).toBeUndefined()
  expect(store.getGrillForUser('g-open', 'grace')?.id).toBe('g-open')

  store.addParticipant('g-invite', 'grace')
  expect(store.getGrillForUser('g-invite', 'grace')?.id).toBe('g-invite')
  sqlite.close()
})

test('shared answer drafts and round submit advance the frontier', () => {
  const { store, sqlite } = harness()
  store.createGrill({
    id: 'g1',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 10,
  })

  store.setFrontier(
    'g1',
    {
      questions: [
        { id: 'q1', prompt: 'Who decides?' },
        { id: 'q2', prompt: 'What ships?' },
      ],
      drafts: { q1: 'agent framing should be ignored' },
    },
    20,
  )
  expect(store.getGrill('g1')?.frontier.drafts).toEqual({})
  expect(() => store.submitRound('g1', 25)).toThrow(
    'Every frontier question needs an answer before submit',
  )

  store.updateDrafts('g1', { q1: 'Accounts', q2: 'Docs' }, 30)
  const submitted = store.submitRound('g1', 40)
  expect(submitted?.settledAnswers).toEqual([
    {
      questions: [
        { id: 'q1', prompt: 'Who decides?' },
        { id: 'q2', prompt: 'What ships?' },
      ],
      answers: { q1: 'Accounts', q2: 'Docs' },
    },
  ])
  expect(submitted?.frontier).toEqual({ questions: [], drafts: {} })
  sqlite.close()
})

test('hard discard clears session state with no leftover rows', () => {
  const { store, sqlite } = harness()
  store.createGrill({
    id: 'g1',
    kind: 'general',
    visibility: 'invite-only',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 10,
  })
  store.addParticipant('g1', 'grace')
  store.setFrontier(
    'g1',
    { questions: [{ id: 'q1', prompt: 'Q?' }], drafts: { q1: 'A' } },
    20,
  )

  expect(store.discardGrill('g1')).toBe(true)
  expect(store.getGrill('g1')).toBeUndefined()
  expect(store.listGrillsForUser('ada')).toHaveLength(0)
  const leftover = sqlite
    .prepare('SELECT COUNT(*) AS n FROM grill_participant')
    .get() as { n: number }
  expect(leftover.n).toBe(0)
  sqlite.close()
})

test('invite creates participant and unacked Attention; ack clears count', () => {
  const { store, sqlite } = harness()
  store.createGrill({
    id: 'g1',
    kind: 'general',
    visibility: 'invite-only',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 10,
  })

  store.invite('g1', 'grace', 20)
  expect(store.getGrillForUser('g1', 'grace')?.id).toBe('g1')
  expect(store.listGrillAttentionCounts('grace').get('g1')).toBe(1)

  const row = sqlite
    .prepare(
      'SELECT kind, source_id, acknowledged_at FROM grill_attention WHERE grill_id = ? AND recipient_id = ?',
    )
    .get('g1', 'grace') as {
    kind: string
    source_id: string
    acknowledged_at: number | null
  }
  expect(row).toMatchObject({
    kind: 'grill_invite',
    source_id: 'g1:grace',
    acknowledged_at: null,
  })

  store.acknowledgeGrillAttention('g1', 'grace', 30)
  expect(store.listGrillAttentionCounts('grace').size).toBe(0)
  const acked = sqlite
    .prepare(
      'SELECT acknowledged_at FROM grill_attention WHERE grill_id = ? AND recipient_id = ?',
    )
    .get('g1', 'grace') as { acknowledged_at: number }
  expect(acked.acknowledged_at).toBe(30)
  sqlite.close()
})

test('discard Grill cascades Attention away', () => {
  const { store, sqlite } = harness()
  store.createGrill({
    id: 'g1',
    kind: 'general',
    visibility: 'invite-only',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 10,
  })
  store.invite('g1', 'grace', 20)
  expect(store.listGrillAttentionCounts('grace').get('g1')).toBe(1)

  expect(store.discardGrill('g1')).toBe(true)
  expect(store.listGrillAttentionCounts('grace').size).toBe(0)
  const leftover = sqlite
    .prepare('SELECT COUNT(*) AS n FROM grill_attention')
    .get() as { n: number }
  expect(leftover.n).toBe(0)
  sqlite.close()
})

test('Issue proposal can be revised, confirmed into Issues, or discarded without minting', () => {
  const created: Array<{
    id: string
    title: string
    description: string
    parentId?: string
  }> = []
  const { store, sqlite } = harness({
    createIssue: (input) => {
      created.push({
        id: input.id,
        title: input.title,
        description: input.description,
        ...(input.parentId ? { parentId: input.parentId } : {}),
      })
      return { id: input.id }
    },
  })
  store.createGrill({
    id: 'g1',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 10,
  })

  const proposed = store.setIssueProposal(
    'g1',
    [
      { key: 'root', title: 'Ship Grill', description: 'Parent' },
      { key: 'child', title: 'Frontier UX', parentKey: 'root' },
    ],
    20,
  )
  expect(proposed?.issueProposal).toEqual({
    status: 'proposed',
    issues: [
      { key: 'root', title: 'Ship Grill', description: 'Parent' },
      { key: 'child', title: 'Frontier UX', parentKey: 'root' },
    ],
  })

  const pushed = store.pushBackIssueProposal('g1', 'Split the child', 30)
  expect(pushed?.issueProposal).toEqual({
    status: 'revision_requested',
    issues: [
      { key: 'root', title: 'Ship Grill', description: 'Parent' },
      { key: 'child', title: 'Frontier UX', parentKey: 'root' },
    ],
    revisionNotes: 'Split the child',
  })

  store.setIssueProposal(
    'g1',
    [
      { key: 'root', title: 'Ship Grill', description: 'Parent' },
      { key: 'ui', title: 'Frontier UI', parentKey: 'root' },
      { key: 'api', title: 'Proposal API', parentKey: 'root' },
    ],
    40,
  )

  const confirmed = store.confirmIssueProposal('g1', 50)
  expect(confirmed?.grill.issueProposal?.status).toBe('confirmed')
  expect(created).toEqual([
    {
      id: expect.any(String),
      title: 'Ship Grill',
      description: 'Parent',
    },
    {
      id: expect.any(String),
      title: 'Frontier UI',
      description: '',
      parentId: created[0]!.id,
    },
    {
      id: expect.any(String),
      title: 'Proposal API',
      description: '',
      parentId: created[0]!.id,
    },
  ])
  expect(confirmed?.issues.map((issue) => issue.title)).toEqual([
    'Ship Grill',
    'Frontier UI',
    'Proposal API',
  ])

  // Abandon before confirm must not mint Issues.
  created.length = 0
  store.createGrill({
    id: 'g2',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 60,
  })
  store.setIssueProposal(
    'g2',
    [{ key: 'x', title: 'Should not exist' }],
    70,
  )
  expect(store.discardGrill('g2')).toBe(true)
  expect(created).toEqual([])
  sqlite.close()
})

test('successful General Grill persists exactly one Doc; abandon creates none', async () => {
  const docs: Array<{ id: string; title: string; body: string }> = []
  const { store, sqlite } = harness({
    createDoc: (doc) => {
      docs.push(doc)
      return doc
    },
  })

  store.createGrill({
    id: 'g-doc',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 10,
  })

  const completed = await store.completeGrill(
    'g-doc',
    {
      title: 'Collaborative Grill',
      body: '# Decisions\n\n- Use Docs for General Grill\n',
    },
    20,
  )
  expect(completed?.id).toBe('g-doc')
  expect(typeof completed?.docId).toBe('string')
  const docId = completed!.docId!
  expect(docs).toEqual([
    {
      id: docId,
      title: 'Collaborative Grill',
      body: '# Decisions\n\n- Use Docs for General Grill\n',
      createdBy: 'ada',
      createdAt: 20,
    },
  ])
  expect(store.getGrill('g-doc')?.docId).toBe(docId)

  store.createGrill({
    id: 'g-abandon',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 30,
  })
  expect(store.discardGrill('g-abandon')).toBe(true)
  expect(docs).toHaveLength(1)
  sqlite.close()
})

test('successful Code Grill materializes remote branch; abandon publishes nothing', async () => {
  const published: Array<{
    repository: string
    baseRef: string
    branch: string
    files: { path: string; content: string }[]
  }> = []
  const { store, sqlite } = harness({
    materializeCodeGrill: (input) => {
      published.push({
        repository: input.repository,
        baseRef: input.baseRef,
        branch: input.branch,
        files: input.files,
      })
      return { branch: input.branch }
    },
  })

  store.createGrill({
    id: 'g-code',
    kind: 'code',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 10,
  })

  const completed = await store.completeGrill(
    'g-code',
    {
      files: [
        {
          path: 'CONTEXT.md',
          content: '# Glossary\n\n**Grill**: design interview\n',
        },
        {
          path: 'docs/adr/0018-issue-branch-binding.md',
          content: '# Issue branch binding\n',
        },
      ],
    },
    20,
  )
  expect(completed?.sessionBranch).toBe('sweat/grill/g-code')
  expect(published).toEqual([
    {
      repository: 'acme/sweat',
      baseRef: 'main',
      branch: 'sweat/grill/g-code',
      files: [
        {
          path: 'CONTEXT.md',
          content: '# Glossary\n\n**Grill**: design interview\n',
        },
        {
          path: 'docs/adr/0018-issue-branch-binding.md',
          content: '# Issue branch binding\n',
        },
      ],
    },
  ])

  store.createGrill({
    id: 'g-code-abandon',
    kind: 'code',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 30,
  })
  expect(store.discardGrill('g-code-abandon')).toBe(true)
  expect(published).toHaveLength(1)
  sqlite.close()
})

test('Code Grill confirm binds session branch on root Issues only; General does not', async () => {
  const branches: Array<{ id: string; branch: string }> = []
  const { store, sqlite } = harness({
    createIssue: (input) => ({ id: input.id }),
    setIssueBranch: (id, branch) => {
      branches.push({ id, branch })
    },
    materializeCodeGrill: (input) => ({ branch: input.branch }),
  })

  store.createGrill({
    id: 'g-code',
    kind: 'code',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 10,
  })
  await store.completeGrill(
    'g-code',
    { files: [{ path: 'CONTEXT.md', content: '# Grill\n' }] },
    20,
  )
  store.setIssueProposal(
    'g-code',
    [
      { key: 'root', title: 'Initiative' },
      { key: 'child', title: 'Child work', parentKey: 'root' },
    ],
    30,
  )
  const confirmed = store.confirmIssueProposal('g-code', 40)
  expect(confirmed?.grill.sessionBranch).toBe('sweat/grill/g-code')
  expect(branches).toEqual([
    { id: confirmed!.issues[0]!.id, branch: 'sweat/grill/g-code' },
  ])
  expect(confirmed!.issues[1]!.parentId).toBe(confirmed!.issues[0]!.id)

  branches.length = 0
  store.createGrill({
    id: 'g-general',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 50,
  })
  store.setIssueProposal(
    'g-general',
    [{ key: 'solo', title: 'No branch' }],
    60,
  )
  store.confirmIssueProposal('g-general', 70)
  expect(branches).toEqual([])

  store.createGrill({
    id: 'g-code-early',
    kind: 'code',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 80,
  })
  store.setIssueProposal(
    'g-code-early',
    [{ key: 'early', title: 'Before materialize' }],
    90,
    [{ path: 'CONTEXT.md', content: '# Pending\n' }],
  )
  expect(() => store.confirmIssueProposal('g-code-early', 100)).toThrow(
    'must materialize',
  )
  expect(branches).toEqual([])
  sqlite.close()
})

test('Accounts can dismiss an Issue proposal without minting Issues', () => {
  const created: string[] = []
  const { store, sqlite } = harness({
    createIssue: (input) => {
      created.push(input.title)
      return { id: input.id }
    },
  })
  store.createGrill({
    id: 'g1',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 10,
  })
  store.setIssueProposal('g1', [{ key: 'solo', title: 'Optional work' }], 20)
  const dismissed = store.dismissIssueProposal('g1', 30)
  expect(dismissed?.issueProposal?.status).toBe('dismissed')
  expect(created).toEqual([])
  expect(() => store.confirmIssueProposal('g1', 40)).toThrow(
    'Issue proposal was dismissed',
  )
  sqlite.close()
})

test('General Grill can propose a writeup for Account complete', () => {
  const { store, sqlite } = harness()
  store.createGrill({
    id: 'g-writeup',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 10,
  })
  const proposed = store.setWriteup(
    'g-writeup',
    { title: 'Decisions', body: '# Done\n' },
    20,
  )
  expect(proposed?.writeup).toEqual({ title: 'Decisions', body: '# Done\n' })
  expect(() =>
    store.setWriteup(
      'g-writeup',
      { title: 'Nope', body: '' },
      30,
    ),
  ).not.toThrow()

  store.createGrill({
    id: 'g-code',
    kind: 'code',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 40,
  })
  expect(() =>
    store.setWriteup('g-code', { title: 'X', body: 'Y' }, 50),
  ).toThrow('Writeup is only for General Grill')
  sqlite.close()
})

test('listGrillsPageForUser paginates newest-first with search and filters', () => {
  const { store, sqlite } = harness()
  store.createGrill({
    id: 'g-old',
    kind: 'general',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    initialRequest: 'Plan the launch',
    createdBy: 'ada',
    createdAt: 10,
  })
  store.createGrill({
    id: 'g-mid',
    kind: 'code',
    visibility: 'invite-only',
    agentDefinitionId: 'interviewer',
    initialRequest: 'Fix auth bug',
    createdBy: 'ada',
    createdAt: 20,
  })
  store.createGrill({
    id: 'g-new',
    kind: 'code',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    initialRequest: 'Fix login flow',
    createdBy: 'ada',
    createdAt: 30,
  })

  const page1 = store.listGrillsPageForUser('ada', { page: 1, pageSize: 2 })
  expect(page1.total).toBe(3)
  expect(page1.grills.map((g) => g.id)).toEqual(['g-new', 'g-mid'])

  const page2 = store.listGrillsPageForUser('ada', { page: 2, pageSize: 2 })
  expect(page2.grills.map((g) => g.id)).toEqual(['g-old'])

  const searched = store.listGrillsPageForUser('ada', {
    page: 1,
    pageSize: 10,
    search: 'fix',
  })
  expect(searched.total).toBe(2)
  expect(searched.grills.map((g) => g.id)).toEqual(['g-new', 'g-mid'])

  const kinds = store.listGrillsPageForUser('ada', {
    page: 1,
    pageSize: 10,
    kinds: ['general'],
  })
  expect(kinds.grills.map((g) => g.id)).toEqual(['g-old'])

  const visibility = store.listGrillsPageForUser('ada', {
    page: 1,
    pageSize: 10,
    visibilities: ['invite-only'],
  })
  expect(visibility.grills.map((g) => g.id)).toEqual(['g-mid'])

  const fallback = store.listGrillsPageForUser('ada', {
    page: 1,
    pageSize: 10,
    search: 'code grill',
  })
  expect(fallback.total).toBe(0)

  store.createGrill({
    id: 'g-untitled',
    kind: 'code',
    visibility: 'workspace-open',
    agentDefinitionId: 'interviewer',
    createdBy: 'ada',
    createdAt: 40,
  })
  const untitled = store.listGrillsPageForUser('ada', {
    page: 1,
    pageSize: 10,
    search: 'code grill',
  })
  expect(untitled.grills.map((g) => g.id)).toEqual(['g-untitled'])
  sqlite.close()
})
