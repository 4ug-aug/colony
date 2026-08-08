type Sqlite = { prepare(sql: string): Statement }
type Statement = {
  all(...values: unknown[]): unknown[]
  get(...values: unknown[]): unknown
  run(...values: unknown[]): unknown
}

export type GrillKind = 'code' | 'general'
export type GrillVisibility = 'invite-only' | 'workspace-open'

export type GrillQuestion = { id: string; prompt: string }

export type GrillFrontier = {
  questions: GrillQuestion[]
  drafts: Record<string, string>
}

export type SettledRound = {
  questions: GrillQuestion[]
  answers: Record<string, string>
}

export type Grill = {
  id: string
  kind: GrillKind
  visibility: GrillVisibility
  agentDefinitionId: string
  repository?: string
  baseRef?: string
  frontier: GrillFrontier
  settledAnswers: SettledRound[]
  draftArtifacts?: unknown
  createdBy: string
  createdAt: number
  updatedAt: number
}

export type NewGrill = {
  id: string
  kind: GrillKind
  visibility: GrillVisibility
  agentDefinitionId: string
  baseRef?: string
  createdBy: string
  createdAt: number
}

export type GrillStoreDeps = {
  hasGuidanceSkill: (agentDefinitionId: string) => boolean
  defaultRepository?: string
  defaultBaseRef?: string
}

export interface GrillStore {
  createGrill(input: NewGrill): Grill
  getGrill(id: string): Grill | undefined
  getGrillForUser(id: string, userId: string): Grill | undefined
  listGrillsForUser(userId: string): Grill[]
  addParticipant(grillId: string, userId: string): void
  invite(grillId: string, userId: string, now: number): void
  listGrillAttentionCounts(userId: string): Map<string, number>
  acknowledgeGrillAttention(grillId: string, userId: string, at: number): void
  setFrontier(grillId: string, frontier: GrillFrontier, now: number): Grill | undefined
  updateDrafts(
    grillId: string,
    drafts: Record<string, string>,
    now: number,
  ): Grill | undefined
  submitRound(grillId: string, now: number): Grill | undefined
  discardGrill(grillId: string): boolean
}

type GrillRow = {
  id: string
  kind: GrillKind
  visibility: GrillVisibility
  agent_definition_id: string
  repository: string | null
  base_ref: string | null
  frontier: string
  settled_answers: string
  draft_artifacts: string | null
  created_by: string
  created_at: number
  updated_at: number
}

const emptyFrontier = (): GrillFrontier => ({ questions: [], drafts: {} })

const parseFrontier = (raw: string): GrillFrontier => {
  try {
    const parsed = JSON.parse(raw) as Partial<GrillFrontier>
    return {
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      drafts:
        parsed.drafts && typeof parsed.drafts === 'object' ? parsed.drafts : {},
    }
  } catch {
    return emptyFrontier()
  }
}

const parseSettled = (raw: string): SettledRound[] => {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as SettledRound[]) : []
  } catch {
    return []
  }
}

const mapGrill = (row: GrillRow): Grill => ({
  id: row.id,
  kind: row.kind,
  visibility: row.visibility,
  agentDefinitionId: row.agent_definition_id,
  ...(row.repository ? { repository: row.repository } : {}),
  ...(row.base_ref ? { baseRef: row.base_ref } : {}),
  frontier: parseFrontier(row.frontier),
  settledAnswers: parseSettled(row.settled_answers),
  ...(row.draft_artifacts
    ? { draftArtifacts: JSON.parse(row.draft_artifacts) as unknown }
    : {}),
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const selectGrill = (sqlite: Sqlite, id: string): Grill | undefined => {
  const row = sqlite
    .prepare('SELECT * FROM grill WHERE id = ?')
    .get(id) as GrillRow | undefined
  return row ? mapGrill(row) : undefined
}

const canAccess = (sqlite: Sqlite, grillId: string, userId: string): boolean => {
  const row = sqlite
    .prepare(
      `SELECT g.visibility AS visibility,
              CASE WHEN g.created_by = ? OR gp.user_id IS NOT NULL THEN 1 ELSE 0 END AS member
       FROM grill g
       LEFT JOIN grill_participant gp
         ON gp.grill_id = g.id AND gp.user_id = ?
       WHERE g.id = ?`,
    )
    .get(userId, userId, grillId) as
    | { visibility: GrillVisibility; member: number }
    | undefined
  if (!row) return false
  if (row.visibility === 'workspace-open') return true
  return row.member === 1
}

export function createSqliteGrillStore(
  sqlite: Sqlite,
  deps: GrillStoreDeps,
): GrillStore {
  return {
    createGrill: (input) => {
      if (!deps.hasGuidanceSkill(input.agentDefinitionId))
        throw new Error(
          'Grill requires an agent definition with an attached Skill',
        )
      if (input.kind === 'code') {
        if (!deps.defaultRepository)
          throw new Error('Code Grill requires a workspace repository')
      }
      const repository =
        input.kind === 'code' ? (deps.defaultRepository ?? null) : null
      const baseRef =
        input.kind === 'code'
          ? (input.baseRef ?? deps.defaultBaseRef ?? 'main')
          : null
      sqlite
        .prepare(
          `INSERT INTO grill (
             id, kind, visibility, agent_definition_id, repository, base_ref,
             frontier, settled_answers, created_by, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.id,
          input.kind,
          input.visibility,
          input.agentDefinitionId,
          repository,
          baseRef,
          JSON.stringify(emptyFrontier()),
          '[]',
          input.createdBy,
          input.createdAt,
          input.createdAt,
        )
      sqlite
        .prepare(
          `INSERT INTO grill_participant (grill_id, user_id) VALUES (?, ?)`,
        )
        .run(input.id, input.createdBy)
      const created = selectGrill(sqlite, input.id)
      if (!created) throw new Error('Failed to create Grill')
      return created
    },
    getGrill: (id) => selectGrill(sqlite, id),
    getGrillForUser: (id, userId) =>
      canAccess(sqlite, id, userId) ? selectGrill(sqlite, id) : undefined,
    listGrillsForUser: (userId) => {
      const rows = sqlite
        .prepare(
          `SELECT g.* FROM grill g
           LEFT JOIN grill_participant gp
             ON gp.grill_id = g.id AND gp.user_id = ?
           WHERE g.visibility = 'workspace-open'
              OR g.created_by = ?
              OR gp.user_id IS NOT NULL
           ORDER BY g.created_at ASC`,
        )
        .all(userId, userId) as GrillRow[]
      return rows.map(mapGrill)
    },
    addParticipant: (grillId, userId) => {
      sqlite
        .prepare(
          `INSERT OR IGNORE INTO grill_participant (grill_id, user_id) VALUES (?, ?)`,
        )
        .run(grillId, userId)
    },
    invite: (grillId, userId, now) => {
      sqlite
        .prepare(
          `INSERT OR IGNORE INTO grill_participant (grill_id, user_id) VALUES (?, ?)`,
        )
        .run(grillId, userId)
      const grill = selectGrill(sqlite, grillId)
      if (!grill || grill.visibility !== 'invite-only') return
      sqlite
        .prepare(
          `INSERT OR IGNORE INTO grill_attention
             (id, grill_id, recipient_id, kind, source_id, created_at)
           VALUES (?, ?, ?, 'grill_invite', ?, ?)`,
        )
        .run(crypto.randomUUID(), grillId, userId, `${grillId}:${userId}`, now)
    },
    listGrillAttentionCounts: (userId) => {
      const rows = sqlite
        .prepare(
          `SELECT grill_id, COUNT(*) AS count
           FROM grill_attention
           WHERE recipient_id = ? AND acknowledged_at IS NULL
           GROUP BY grill_id`,
        )
        .all(userId) as { grill_id: string; count: number }[]
      return new Map(rows.map(({ grill_id, count }) => [grill_id, count]))
    },
    acknowledgeGrillAttention: (grillId, userId, at) => {
      sqlite
        .prepare(
          `UPDATE grill_attention SET acknowledged_at = ?
           WHERE grill_id = ? AND recipient_id = ? AND acknowledged_at IS NULL`,
        )
        .run(at, grillId, userId)
    },
    setFrontier: (grillId, frontier, now) => {
      const result = sqlite
        .prepare(
          `UPDATE grill SET frontier = ?, updated_at = ? WHERE id = ?`,
        )
        .run(JSON.stringify(frontier), now, grillId) as { changes?: number }
      if ((result.changes ?? 0) === 0) return undefined
      return selectGrill(sqlite, grillId)
    },
    updateDrafts: (grillId, drafts, now) => {
      const current = selectGrill(sqlite, grillId)
      if (!current) return undefined
      const frontier: GrillFrontier = {
        questions: current.frontier.questions,
        drafts: { ...current.frontier.drafts, ...drafts },
      }
      sqlite
        .prepare(
          `UPDATE grill SET frontier = ?, updated_at = ? WHERE id = ?`,
        )
        .run(JSON.stringify(frontier), now, grillId)
      return selectGrill(sqlite, grillId)
    },
    submitRound: (grillId, now) => {
      const current = selectGrill(sqlite, grillId)
      if (!current) return undefined
      const settled: SettledRound[] = [
        ...current.settledAnswers,
        {
          questions: current.frontier.questions,
          answers: { ...current.frontier.drafts },
        },
      ]
      sqlite
        .prepare(
          `UPDATE grill SET settled_answers = ?, frontier = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          JSON.stringify(settled),
          JSON.stringify(emptyFrontier()),
          now,
          grillId,
        )
      return selectGrill(sqlite, grillId)
    },
    discardGrill: (grillId) =>
      ((
        sqlite.prepare('DELETE FROM grill WHERE id = ?').run(grillId) as {
          changes?: number
        }
      ).changes ?? 0) > 0,
  }
}
