import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import {
  validateSkillPackageFiles,
  type SkillPackageFile,
} from '#project/skills/package'
import type { TransactionalSqlite } from '#/server/secret-box'

export type WorkspaceSkill = {
  id: string
  name: string
  description: string
  contentHash: string
  storageKey: string
  createdAt: number
  updatedAt: number
}

export type SkillAttachmentMap = Record<string, string[]>

type StoredSkill = {
  id: string
  name: string
  description: string
  content_hash: string
  storage_key: string
  created_at: number
  updated_at: number
}

const toPublic = (row: StoredSkill): WorkspaceSkill => ({
  id: row.id,
  name: row.name,
  description: row.description,
  contentHash: row.content_hash,
  storageKey: row.storage_key,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export function skillDirectory(databasePath: string): string {
  return resolve(dirname(resolve(databasePath)), 'skills')
}

async function writePackageTree(
  root: string,
  files: readonly SkillPackageFile[],
): Promise<void> {
  await mkdir(root, { recursive: true })
  for (const file of files) {
    const target = resolve(root, file.path)
    if (!target.startsWith(root + sep) && target !== root) {
      throw new Error(`Invalid skill package path: ${file.path}`)
    }
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.bytes)
  }
}

async function removeTree(root: string, storageKey: string): Promise<void> {
  const target = resolve(root, storageKey)
  if (!target.startsWith(root + sep)) return
  await rm(target, { force: true, recursive: true })
}

async function readSkillPackageFiles(
  packageRoot: string,
): Promise<SkillPackageFile[]> {
  const root = resolve(packageRoot)
  const files: SkillPackageFile[] = []

  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute, relative)
        continue
      }
      if (!entry.isFile()) continue
      files.push({
        path: relative,
        bytes: new Uint8Array(await readFile(absolute)),
      })
    }
  }

  await walk(root, '')
  return files
}

export async function extractZipToDirectory(
  zipBytes: Uint8Array,
  destination: string,
): Promise<void> {
  await mkdir(destination, { recursive: true })
  const zipPath = join(destination, '.package.zip')
  await writeFile(zipPath, zipBytes)
  const process = Bun.spawn(['unzip', '-q', zipPath, '-d', destination], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ])
  await rm(zipPath, { force: true })
  if (exitCode) {
    throw new Error(stderr.trim() || 'Could not extract skill package zip')
  }
}

/** Flatten a zip that wrapped a single top-level folder into package-root files. */
export async function normalizeExtractedPackage(
  directory: string,
): Promise<SkillPackageFile[]> {
  let files = await readSkillPackageFiles(directory)
  const topLevels = new Set(
    files.map((file) => file.path.split('/')[0]!).filter(Boolean),
  )
  if (topLevels.size === 1) {
    const only = [...topLevels][0]!
    if (only !== 'SKILL.md' && !files.some((file) => file.path === 'SKILL.md')) {
      const prefix = `${only}/`
      files = files
        .filter((file) => file.path.startsWith(prefix))
        .map((file) => ({
          path: file.path.slice(prefix.length),
          bytes: file.bytes,
        }))
    }
  }
  return files
}

export type WorkspaceSkillStore = {
  list(): WorkspaceSkill[]
  get(id: string): WorkspaceSkill | undefined
  getByName(name: string): WorkspaceSkill | undefined
  packagePath(skill: WorkspaceSkill): string
  importFiles(
    files: readonly SkillPackageFile[],
    now?: number,
  ): Promise<WorkspaceSkill>
  delete(id: string): Promise<void>
  listAttachments(): SkillAttachmentMap
  listAttachedSkillIds(agentDefinitionId: string): string[]
  setAttachments(agentDefinitionId: string, skillIds: readonly string[]): void
  listAttachedPackages(
    agentDefinitionId: string,
  ): Promise<{ skill: WorkspaceSkill; files: SkillPackageFile[] }[]>
  readPackage(
    id: string,
  ): Promise<{ skill: WorkspaceSkill; files: { path: string; content: string }[] } | undefined>
}

export function createWorkspaceSkillStore(options: {
  sqlite: TransactionalSqlite
  directory: string
}): WorkspaceSkillStore {
  const { sqlite, directory } = options
  const root = resolve(directory)

  const read = (id: string): StoredSkill | undefined =>
    sqlite
      .prepare(
        `SELECT id, name, description, content_hash, storage_key, created_at, updated_at
         FROM workspace_skill WHERE id = ?`,
      )
      .get(id) as StoredSkill | undefined

  const readByName = (name: string): StoredSkill | undefined =>
    sqlite
      .prepare(
        `SELECT id, name, description, content_hash, storage_key, created_at, updated_at
         FROM workspace_skill WHERE name = ?`,
      )
      .get(name) as StoredSkill | undefined

  return {
    list() {
      return (
        sqlite
          .prepare(
            `SELECT id, name, description, content_hash, storage_key, created_at, updated_at
             FROM workspace_skill ORDER BY name COLLATE NOCASE`,
          )
          .all() as StoredSkill[]
      ).map(toPublic)
    },

    get(id) {
      const row = read(id)
      return row ? toPublic(row) : undefined
    },

    getByName(name) {
      const row = readByName(name)
      return row ? toPublic(row) : undefined
    },

    packagePath(skill) {
      return resolve(root, skill.storageKey)
    },

    async importFiles(files, now = Date.now()) {
      const validated = validateSkillPackageFiles(files)
      const existing = readByName(validated.frontmatter.name)
      const id = existing?.id ?? randomUUID()
      const storageKey = randomUUID()
      const packageRoot = resolve(root, storageKey)
      if (!packageRoot.startsWith(root + sep)) {
        throw new Error('Invalid skill storage path')
      }

      await mkdir(root, { recursive: true })
      const temporary = resolve(root, `.${storageKey}.tmp`)
      await rm(temporary, { force: true, recursive: true })
      try {
        await writePackageTree(temporary, validated.files)
        await rename(temporary, packageRoot)
      } catch (error) {
        await rm(temporary, { force: true, recursive: true })
        throw error
      }

      if (existing) {
        sqlite
          .prepare(
            `UPDATE workspace_skill
             SET description = ?, content_hash = ?, storage_key = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            validated.frontmatter.description,
            validated.contentHash,
            storageKey,
            now,
            id,
          )
        await removeTree(root, existing.storage_key)
      } else {
        sqlite
          .prepare(
            `INSERT INTO workspace_skill
               (id, name, description, content_hash, storage_key, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            validated.frontmatter.name,
            validated.frontmatter.description,
            validated.contentHash,
            storageKey,
            now,
            now,
          )
      }

      return toPublic(read(id)!)
    },

    async delete(id) {
      const row = read(id)
      if (!row) return
      const tx = sqlite.transaction(() => {
        sqlite
          .prepare('DELETE FROM agent_definition_skill WHERE skill_id = ?')
          .run(id)
        sqlite.prepare('DELETE FROM workspace_skill WHERE id = ?').run(id)
      })
      tx()
      await removeTree(root, row.storage_key)
    },

    listAttachments() {
      const rows = sqlite
        .prepare(
          `SELECT agent_definition_id, skill_id FROM agent_definition_skill`,
        )
        .all() as { agent_definition_id: string; skill_id: string }[]
      const map: SkillAttachmentMap = {}
      for (const row of rows) {
        const list = map[row.agent_definition_id] ?? []
        list.push(row.skill_id)
        map[row.agent_definition_id] = list
      }
      return map
    },

    listAttachedSkillIds(agentDefinitionId) {
      return (
        sqlite
          .prepare(
            `SELECT skill_id FROM agent_definition_skill WHERE agent_definition_id = ?`,
          )
          .all(agentDefinitionId) as { skill_id: string }[]
      ).map((row) => row.skill_id)
    },

    setAttachments(agentDefinitionId, skillIds) {
      const unique = [...new Set(skillIds)]
      for (const skillId of unique) {
        if (!read(skillId)) throw new Error(`Unknown skill: ${skillId}`)
      }
      const tx = sqlite.transaction(() => {
        sqlite
          .prepare(
            'DELETE FROM agent_definition_skill WHERE agent_definition_id = ?',
          )
          .run(agentDefinitionId)
        const insert = sqlite.prepare(
          `INSERT INTO agent_definition_skill (agent_definition_id, skill_id)
           VALUES (?, ?)`,
        )
        for (const skillId of unique) insert.run(agentDefinitionId, skillId)
      })
      tx()
    },

    async listAttachedPackages(agentDefinitionId) {
      const ids = this.listAttachedSkillIds(agentDefinitionId)
      const packages: { skill: WorkspaceSkill; files: SkillPackageFile[] }[] =
        []
      for (const id of ids) {
        const skill = this.get(id)
        if (!skill) continue
        const path = this.packagePath(skill)
        try {
          await stat(path)
        } catch {
          continue
        }
        packages.push({
          skill,
          files: await readSkillPackageFiles(path),
        })
      }
      return packages
    },

    async readPackage(id) {
      const skill = this.get(id)
      if (!skill) return undefined
      const path = this.packagePath(skill)
      try {
        await stat(path)
      } catch {
        return undefined
      }
      const files = await readSkillPackageFiles(path)
      return {
        skill,
        files: files.map((file) => ({
          path: file.path,
          content: new TextDecoder().decode(file.bytes),
        })),
      }
    },
  }
}
