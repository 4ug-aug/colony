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
`

function harness(opts?: { hasGuidanceSkill?: (agentId: string) => boolean }) {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(schema)
  const store = createSqliteGrillStore(sqlite, {
    hasGuidanceSkill: opts?.hasGuidanceSkill ?? (() => true),
    defaultRepository: 'acme/sweat',
    defaultBaseRef: 'main',
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
      drafts: {},
    },
    20,
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
