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
`

const ada: RoomUser = { id: 'ada', name: 'Ada' }
const grace: RoomUser = { id: 'grace', name: 'Grace' }

function harness(hasGuidanceSkill = true) {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(schema)
  const grillStore = createSqliteGrillStore(sqlite, {
    hasGuidanceSkill: () => hasGuidanceSkill,
    defaultRepository: 'acme/sweat',
    defaultBaseRef: 'main',
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
