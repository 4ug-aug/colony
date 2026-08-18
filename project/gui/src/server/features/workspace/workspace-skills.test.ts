import { migratedDatabase } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkspaceSkillStore } from './workspace-skills'


const skillMd = (name: string, description: string) =>
  new TextEncoder().encode(`---
name: ${name}
description: ${description}
---

# ${name}
`)

test('imports, replaces by name, attaches, and delete cascades detach', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sweat-skills-'))
  const sqlite = migratedDatabase()
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
  const sqlite = migratedDatabase()
  const store = createWorkspaceSkillStore({ sqlite, directory })
  expect(() => store.setAttachments('antboy', ['missing'])).toThrow(/Unknown skill/)
  await rm(directory, { force: true, recursive: true })
})
