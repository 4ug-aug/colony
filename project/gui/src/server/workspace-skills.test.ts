import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkspaceSkillStore } from './workspace-skills'

const schema = `
CREATE TABLE workspace_skill (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  content_hash text NOT NULL,
  storage_key text NOT NULL,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
CREATE UNIQUE INDEX workspace_skill_name_unique ON workspace_skill (name);
CREATE UNIQUE INDEX workspace_skill_storage_key_unique ON workspace_skill (storage_key);
CREATE TABLE agent_definition_skill (
  agent_definition_id text NOT NULL,
  skill_id text NOT NULL REFERENCES workspace_skill (id) ON DELETE CASCADE,
  PRIMARY KEY (agent_definition_id, skill_id)
);
`

const skillMd = (name: string, description: string) =>
  new TextEncoder().encode(`---
name: ${name}
description: ${description}
---

# ${name}
`)

test('imports, replaces by name, attaches, and delete cascades detach', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sweat-skills-'))
  const sqlite = new Database(':memory:')
  sqlite.exec(schema)
  const store = createWorkspaceSkillStore({ sqlite, directory })

  const first = await store.importFiles([
    {
      path: 'SKILL.md',
      bytes: skillMd('summarize', 'Summarize changes.'),
    },
  ])
  expect(first.name).toBe('summarize')
  store.setAttachments('software-engineer', [first.id])
  expect(store.listAttachedSkillIds('software-engineer')).toEqual([first.id])

  const replaced = await store.importFiles([
    {
      path: 'SKILL.md',
      bytes: skillMd('summarize', 'Summarize with more detail.'),
    },
    {
      path: 'references/format.md',
      bytes: new TextEncoder().encode('# Format\n'),
    },
  ])
  expect(replaced.id).toBe(first.id)
  expect(replaced.description).toBe('Summarize with more detail.')
  expect(store.listAttachedSkillIds('software-engineer')).toEqual([first.id])

  await store.delete(first.id)
  expect(store.list()).toEqual([])
  expect(store.listAttachedSkillIds('software-engineer')).toEqual([])

  await rm(directory, { force: true, recursive: true })
})

test('rejects unknown skill attachments', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sweat-skills-'))
  const sqlite = new Database(':memory:')
  sqlite.exec(schema)
  const store = createWorkspaceSkillStore({ sqlite, directory })
  expect(() => store.setAttachments('antboy', ['missing'])).toThrow(/Unknown skill/)
  await rm(directory, { force: true, recursive: true })
})
