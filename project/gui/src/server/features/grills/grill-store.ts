import type { Sqlite } from '#/server/sqlite'

export type GrillKind = 'code' | 'general'
export type GrillVisibility = 'invite-only' | 'workspace-open'

export type GrillChoice = {
  id: string
  label: string
  description?: string
}

export type GrillQuestion = {
  id: string
  prompt: string
  choices?: GrillChoice[]
  recommendedChoiceId?: string
  recommendation?: string
}

export type GrillFrontier = {
  questions: GrillQuestion[]
  drafts: Record<string, string>
}

export type SettledRound = {
  questions: GrillQuestion[]
  answers: Record<string, string>
}

export type GrillProposedIssue = {
  key: string
  title: string
  description?: string
  parentKey?: string
}

export type GrillIssueProposal = {
  status: 'proposed' | 'revision_requested' | 'confirmed' | 'dismissed'
  issues: GrillProposedIssue[]
  files?: GrillMaterializeFile[]
  revisionNotes?: string
}

/** Proposed lasting Doc writeup for a General Grill (Accounts complete to persist). */
export type GrillWriteupProposal = {
  title: string
  body: string
}

export type GrillCreatedIssue = {
  id: string
  title: string
  description: string
  parentId?: string
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
  initialRequest?: string
  issueProposal?: GrillIssueProposal
  writeup?: GrillWriteupProposal
  docId?: string
  sessionBranch?: string
  draftArtifacts?: unknown
  createdBy: string
  createdAt: number
  updatedAt: number
}

export type GrillWriteup = {
  title: string
  body: string
}

export type GrillMaterializeFile = {
  path: string
  content: string
}

export type NewGrill = {
  id: string
  kind: GrillKind
  visibility: GrillVisibility
  agentDefinitionId: string
  baseRef?: string
  initialRequest?: string
  createdBy: string
  createdAt: number
}

export type GrillStoreDeps = {
  hasGuidanceSkill: (agentDefinitionId: string) => boolean
  defaultRepository?: string
  defaultBaseRef?: string
  createIssue?: (input: {
    id: string
    title: string
    description: string
    parentId?: string
    createdBy: { kind: 'account'; id: string }
    createdAt: number
  }) => { id: string }
  createDoc?: (input: {
    id: string
    title: string
    body: string
    createdBy: string
    createdAt: number
  }) => { id: string }
  materializeCodeGrill?: (input: {
    grillId: string
    repository: string
    baseRef: string
    branch: string
    files: GrillMaterializeFile[]
  }) => Promise<{ branch: string }> | { branch: string }
  setIssueBranch?: (issueId: string, branch: string, now: number) => void
}

export interface GrillStore {
  createGrill(input: NewGrill): Grill
  getGrill(id: string): Grill | undefined
  getGrillForUser(id: string, userId: string): Grill | undefined
  listGrillsForUser(userId: string): Grill[]
  listGrillsMatchingForUser(
    userId: string,
    query: Pick<GrillListPageQuery, 'search' | 'kinds' | 'visibilities'>,
  ): Grill[]
  listGrillsPageForUser(
    userId: string,
    query: GrillListPageQuery,
  ): GrillListPage
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
  submitRound(
    grillId: string,
    now: number,
    drafts?: Record<string, string>,
  ): Grill | undefined
  setIssueProposal(
    grillId: string,
    issues: GrillProposedIssue[],
    now: number,
    files?: GrillMaterializeFile[],
  ): Grill | undefined
  setWriteup(
    grillId: string,
    writeup: GrillWriteupProposal,
    now: number,
  ): Grill | undefined
  pushBackIssueProposal(
    grillId: string,
    revisionNotes: string,
    now: number,
  ): Grill | undefined
  confirmIssueProposal(
    grillId: string,
    now: number,
  ): { grill: Grill; issues: GrillCreatedIssue[] } | undefined
  dismissIssueProposal(grillId: string, now: number): Grill | undefined
  completeGrill(
    grillId: string,
    artifact: GrillWriteup | { files: GrillMaterializeFile[] },
    now: number,
  ): Promise<Grill | undefined>
  discardGrill(grillId: string): boolean
}

export type GrillListPageQuery = {
  search?: string
  kinds?: GrillKind[]
  visibilities?: GrillVisibility[]
  /** 1-based page index */
  page: number
  pageSize: number
}

export type GrillListPage = {
  grills: Grill[]
  total: number
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

const parseDraftArtifacts = (
  raw: string | null,
): {
  issueProposal?: GrillIssueProposal
  writeup?: GrillWriteupProposal
  initialRequest?: string
  docId?: string
  sessionBranch?: string
  draftArtifacts?: unknown
} => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return { draftArtifacts: parsed }
    const record = parsed as Record<string, unknown>
    const initialRequest =
      typeof record.initialRequest === 'string' && record.initialRequest.trim()
        ? record.initialRequest.trim()
        : undefined
    const issueProposal =
      record.issueProposal &&
      typeof record.issueProposal === 'object' &&
      !Array.isArray(record.issueProposal)
        ? (record.issueProposal as GrillIssueProposal)
        : undefined
    const writeupRaw = record.writeup
    const writeup =
      writeupRaw &&
      typeof writeupRaw === 'object' &&
      !Array.isArray(writeupRaw) &&
      typeof (writeupRaw as { title?: unknown }).title === 'string' &&
      typeof (writeupRaw as { body?: unknown }).body === 'string'
        ? {
            title: (writeupRaw as { title: string }).title,
            body: (writeupRaw as { body: string }).body,
          }
        : undefined
    const docId =
      typeof record.docId === 'string' && record.docId.trim()
        ? record.docId.trim()
        : undefined
    const sessionBranch =
      typeof record.sessionBranch === 'string' && record.sessionBranch.trim()
        ? record.sessionBranch.trim()
        : undefined
    const rest = { ...record }
    delete rest.issueProposal
    delete rest.writeup
    delete rest.initialRequest
    delete rest.docId
    delete rest.sessionBranch
    return {
      ...(issueProposal ? { issueProposal } : {}),
      ...(writeup ? { writeup } : {}),
      ...(initialRequest ? { initialRequest } : {}),
      ...(docId ? { docId } : {}),
      ...(sessionBranch ? { sessionBranch } : {}),
      ...(Object.keys(rest).length > 0 ? { draftArtifacts: rest } : {}),
    }
  } catch {
    return {}
  }
}

const encodeDraftArtifacts = (
  issueProposal: GrillIssueProposal | undefined,
  draftArtifacts: unknown,
  initialRequest?: string,
  docId?: string,
  sessionBranch?: string,
  writeup?: GrillWriteupProposal,
): string | null => {
  const envelope: Record<string, unknown> = {}
  if (initialRequest) envelope.initialRequest = initialRequest
  if (issueProposal) envelope.issueProposal = issueProposal
  if (writeup) envelope.writeup = writeup
  if (docId) envelope.docId = docId
  if (sessionBranch) envelope.sessionBranch = sessionBranch
  if (
    draftArtifacts &&
    typeof draftArtifacts === 'object' &&
    !Array.isArray(draftArtifacts)
  ) {
    Object.assign(envelope, draftArtifacts as Record<string, unknown>)
  } else if (draftArtifacts !== undefined) {
    envelope.other = draftArtifacts
  }
  return Object.keys(envelope).length > 0 ? JSON.stringify(envelope) : null
}

const normalizeProposedIssues = (
  issues: GrillProposedIssue[],
): GrillProposedIssue[] => {
  const keys = new Set<string>()
  const normalized: GrillProposedIssue[] = []
  for (const issue of issues) {
    const key = issue.key.trim()
    const title = issue.title.trim()
    if (!key || !title) throw new Error('Invalid Issue proposal')
    if (keys.has(key)) throw new Error('Duplicate Issue proposal key')
    keys.add(key)
    const parentKey = issue.parentKey?.trim()
    if (parentKey === key) throw new Error('Invalid Issue proposal parent')
    normalized.push({
      key,
      title,
      ...(issue.description !== undefined
        ? { description: issue.description }
        : {}),
      ...(parentKey ? { parentKey } : {}),
    })
  }
  for (const issue of normalized) {
    if (issue.parentKey && !keys.has(issue.parentKey))
      throw new Error('Unknown Issue proposal parent')
  }
  return normalized
}

const mapGrill = (row: GrillRow): Grill => {
  const artifacts = parseDraftArtifacts(row.draft_artifacts)
  return {
    id: row.id,
    kind: row.kind,
    visibility: row.visibility,
    agentDefinitionId: row.agent_definition_id,
    ...(row.repository ? { repository: row.repository } : {}),
    ...(row.base_ref ? { baseRef: row.base_ref } : {}),
    frontier: parseFrontier(row.frontier),
    settledAnswers: parseSettled(row.settled_answers),
    ...(artifacts.initialRequest
      ? { initialRequest: artifacts.initialRequest }
      : {}),
    ...(artifacts.issueProposal
      ? { issueProposal: artifacts.issueProposal }
      : {}),
    ...(artifacts.writeup ? { writeup: artifacts.writeup } : {}),
    ...(artifacts.docId ? { docId: artifacts.docId } : {}),
    ...(artifacts.sessionBranch
      ? { sessionBranch: artifacts.sessionBranch }
      : {}),
    ...(artifacts.draftArtifacts !== undefined
      ? { draftArtifacts: artifacts.draftArtifacts }
      : {}),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

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

const ACCESS_FROM = `FROM grill g
           LEFT JOIN grill_participant gp
             ON gp.grill_id = g.id AND gp.user_id = ?
           WHERE (g.visibility = 'workspace-open'
              OR g.created_by = ?
              OR gp.user_id IS NOT NULL)`

function buildGrillListFilter(
  userId: string,
  query: Pick<GrillListPageQuery, 'search' | 'kinds' | 'visibilities'>,
): { whereSql: string; params: unknown[] } {
  const params: unknown[] = [userId, userId]
  const clauses: string[] = []

  if (query.kinds && query.kinds.length > 0) {
    clauses.push(
      `g.kind IN (${query.kinds.map(() => '?').join(', ')})`,
    )
    params.push(...query.kinds)
  }

  if (query.visibilities && query.visibilities.length > 0) {
    clauses.push(
      `g.visibility IN (${query.visibilities.map(() => '?').join(', ')})`,
    )
    params.push(...query.visibilities)
  }

  const search = query.search?.trim().toLowerCase() ?? ''
  if (search) {
    const like = `%${search}%`
    const matchCodeFallback = 'code grill'.includes(search)
    const matchGeneralFallback = 'general grill'.includes(search)
    clauses.push(`(
      lower(coalesce(json_extract(g.draft_artifacts, '$.initialRequest'), '')) LIKE ?
      OR (
        length(trim(coalesce(json_extract(g.draft_artifacts, '$.initialRequest'), ''))) = 0
        AND (
          (g.kind = 'code' AND ? = 1)
          OR (g.kind = 'general' AND ? = 1)
        )
      )
    )`)
    params.push(like, matchCodeFallback ? 1 : 0, matchGeneralFallback ? 1 : 0)
  }

  const whereSql =
    clauses.length === 0
      ? ACCESS_FROM
      : `${ACCESS_FROM} AND ${clauses.join(' AND ')}`
  return { whereSql, params }
}

export function normalizeGrillListPageQuery(
  input: Partial<GrillListPageQuery> &
    Pick<GrillListPageQuery, 'page' | 'pageSize'>,
): GrillListPageQuery {
  const page = Math.max(1, Math.floor(input.page) || 1)
  const pageSize = Math.max(1, Math.min(100, Math.floor(input.pageSize) || 10))
  return {
    page,
    pageSize,
    ...(input.search?.trim() ? { search: input.search.trim() } : {}),
    ...(input.kinds && input.kinds.length > 0 ? { kinds: input.kinds } : {}),
    ...(input.visibilities && input.visibilities.length > 0
      ? { visibilities: input.visibilities }
      : {}),
  }
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
      const initialRequest = input.initialRequest?.trim() || undefined
      sqlite
        .prepare(
          `INSERT INTO grill (
             id, kind, visibility, agent_definition_id, repository, base_ref,
             frontier, settled_answers, draft_artifacts, created_by, created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          encodeDraftArtifacts(undefined, undefined, initialRequest),
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
    listGrillsMatchingForUser: (userId, query) => {
      const { whereSql, params } = buildGrillListFilter(userId, query)
      const rows = sqlite
        .prepare(
          `SELECT g.* ${whereSql}
           ORDER BY g.updated_at DESC, g.id DESC`,
        )
        .all(...params) as GrillRow[]
      return rows.map(mapGrill)
    },
    listGrillsPageForUser: (userId, rawQuery) => {
      const query = normalizeGrillListPageQuery(rawQuery)
      const { whereSql, params } = buildGrillListFilter(userId, query)
      const totalRow = sqlite
        .prepare(`SELECT COUNT(*) AS total ${whereSql}`)
        .get(...params) as { total: number }
      const total = Number(totalRow.total) || 0
      const offset = (query.page - 1) * query.pageSize
      const rows = sqlite
        .prepare(
          `SELECT g.* ${whereSql}
           ORDER BY g.updated_at DESC, g.id DESC
           LIMIT ? OFFSET ?`,
        )
        .all(...params, query.pageSize, offset) as GrillRow[]
      return { grills: rows.map(mapGrill), total }
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
      // Questions are agent-authored; shared answer drafts belong to Accounts.
      const next: GrillFrontier = {
        questions: frontier.questions,
        drafts: {},
      }
      const result = sqlite
        .prepare(
          `UPDATE grill SET frontier = ?, updated_at = ? WHERE id = ?`,
        )
        .run(JSON.stringify(next), now, grillId) as { changes?: number }
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
    submitRound: (grillId, now, drafts) => {
      const current = selectGrill(sqlite, grillId)
      if (!current) return undefined
      if (current.frontier.questions.length === 0)
        throw new Error('No frontier questions to submit')
      const mergedDrafts = {
        ...current.frontier.drafts,
        ...(drafts ?? {}),
      }
      const answers: Record<string, string> = {}
      for (const question of current.frontier.questions) {
        const answer = (mergedDrafts[question.id] ?? '').trim()
        if (!answer || answer === '__grill_other__')
          throw new Error('Every frontier question needs an answer before submit')
        answers[question.id] = answer
      }
      const settled: SettledRound[] = [
        ...current.settledAnswers,
        {
          questions: current.frontier.questions,
          answers,
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
    setIssueProposal: (grillId, issues, now, files) => {
      const current = selectGrill(sqlite, grillId)
      if (!current) return undefined
      if (current.issueProposal?.status === 'confirmed')
        throw new Error('Issue proposal already confirmed')
      const materializeFiles = files?.map((file) => ({
        path: file.path.trim(),
        content: file.content,
      }))
      if (materializeFiles?.some((file) => !file.path))
        throw new Error('Invalid materialize file path')
      if (
        current.kind === 'code' &&
        !current.sessionBranch &&
        !materializeFiles?.length
      )
        throw new Error('Code Grill Issue proposal requires materialize files')
      const proposal: GrillIssueProposal = {
        status: 'proposed',
        issues: normalizeProposedIssues(issues),
        ...(materializeFiles?.length ? { files: materializeFiles } : {}),
      }
      sqlite
        .prepare(
          `UPDATE grill SET draft_artifacts = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          encodeDraftArtifacts(
            proposal,
            current.draftArtifacts,
            current.initialRequest,
            current.docId,
            current.sessionBranch,
            current.writeup,
          ),
          now,
          grillId,
        )
      return selectGrill(sqlite, grillId)
    },
    setWriteup: (grillId, writeup, now) => {
      const current = selectGrill(sqlite, grillId)
      if (!current) return undefined
      if (current.kind !== 'general')
        throw new Error('Writeup is only for General Grill')
      if (current.docId) throw new Error('Grill already completed')
      const title = writeup.title.trim()
      if (!title) throw new Error('Writeup title is required')
      const next: GrillWriteupProposal = { title, body: writeup.body }
      sqlite
        .prepare(
          `UPDATE grill SET draft_artifacts = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          encodeDraftArtifacts(
            current.issueProposal,
            current.draftArtifacts,
            current.initialRequest,
            current.docId,
            current.sessionBranch,
            next,
          ),
          now,
          grillId,
        )
      return selectGrill(sqlite, grillId)
    },
    pushBackIssueProposal: (grillId, revisionNotes, now) => {
      const current = selectGrill(sqlite, grillId)
      if (!current?.issueProposal) return undefined
      if (current.issueProposal.status === 'confirmed')
        throw new Error('Issue proposal already confirmed')
      if (current.issueProposal.status === 'dismissed')
        throw new Error('Issue proposal was dismissed')
      const notes = revisionNotes.trim()
      if (!notes) throw new Error('Revision notes required')
      const proposal: GrillIssueProposal = {
        status: 'revision_requested',
        issues: current.issueProposal.issues,
        ...(current.issueProposal.files
          ? { files: current.issueProposal.files }
          : {}),
        revisionNotes: notes,
      }
      sqlite
        .prepare(
          `UPDATE grill SET draft_artifacts = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          encodeDraftArtifacts(
            proposal,
            current.draftArtifacts,
            current.initialRequest,
            current.docId,
            current.sessionBranch,
            current.writeup,
          ),
          now,
          grillId,
        )
      return selectGrill(sqlite, grillId)
    },
    confirmIssueProposal: (grillId, now) => {
      const current = selectGrill(sqlite, grillId)
      if (!current?.issueProposal) return undefined
      if (current.issueProposal.status === 'confirmed')
        throw new Error('Issue proposal already confirmed')
      if (current.issueProposal.status === 'dismissed')
        throw new Error('Issue proposal was dismissed')
      if (!deps.createIssue)
        throw new Error('Issue creation is unavailable')
      if (current.kind === 'code' && !current.sessionBranch)
        throw new Error('Code Grill must materialize before confirming Issues')
      const proposed = current.issueProposal.issues
      const remaining = new Map(proposed.map((issue) => [issue.key, issue]))
      const keyToId = new Map<string, string>()
      const created: GrillCreatedIssue[] = []
      while (remaining.size > 0) {
        let progressed = false
        for (const [key, issue] of remaining) {
          if (issue.parentKey && !keyToId.has(issue.parentKey)) continue
          const id = crypto.randomUUID()
          const parentId = issue.parentKey
            ? keyToId.get(issue.parentKey)
            : undefined
          const description = issue.description ?? ''
          deps.createIssue({
            id,
            title: issue.title,
            description,
            ...(parentId ? { parentId } : {}),
            createdBy: { kind: 'account', id: current.createdBy },
            createdAt: now,
          })
          keyToId.set(key, id)
          created.push({
            id,
            title: issue.title,
            description,
            ...(parentId ? { parentId } : {}),
          })
          remaining.delete(key)
          progressed = true
        }
        if (!progressed) throw new Error('Cyclic Issue proposal parent')
      }
      if (
        current.kind === 'code' &&
        current.sessionBranch &&
        deps.setIssueBranch
      ) {
        for (const issue of created) {
          if (issue.parentId) continue
          deps.setIssueBranch(issue.id, current.sessionBranch, now)
        }
      }
      const proposal: GrillIssueProposal = {
        status: 'confirmed',
        issues: proposed,
        ...(current.issueProposal.files
          ? { files: current.issueProposal.files }
          : {}),
      }
      sqlite
        .prepare(
          `UPDATE grill SET draft_artifacts = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          encodeDraftArtifacts(
            proposal,
            current.draftArtifacts,
            current.initialRequest,
            current.docId,
            current.sessionBranch,
            current.writeup,
          ),
          now,
          grillId,
        )
      const grill = selectGrill(sqlite, grillId)
      if (!grill) return undefined
      return { grill, issues: created }
    },
    dismissIssueProposal: (grillId, now) => {
      const current = selectGrill(sqlite, grillId)
      if (!current?.issueProposal) return undefined
      if (current.issueProposal.status === 'confirmed')
        throw new Error('Issue proposal already confirmed')
      if (current.issueProposal.status === 'dismissed')
        return current
      const proposal: GrillIssueProposal = {
        status: 'dismissed',
        issues: current.issueProposal.issues,
        ...(current.issueProposal.files
          ? { files: current.issueProposal.files }
          : {}),
      }
      sqlite
        .prepare(
          `UPDATE grill SET draft_artifacts = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          encodeDraftArtifacts(
            proposal,
            current.draftArtifacts,
            current.initialRequest,
            current.docId,
            current.sessionBranch,
            current.writeup,
          ),
          now,
          grillId,
        )
      return selectGrill(sqlite, grillId)
    },
    completeGrill: async (grillId, artifact, now) => {
      const current = selectGrill(sqlite, grillId)
      if (!current) return undefined
      if (current.docId || current.sessionBranch)
        throw new Error('Grill already completed')

      if (current.kind === 'general') {
        if (!('title' in artifact) || !('body' in artifact))
          throw new Error('General Grill requires a writeup')
        const title = artifact.title.trim()
        const body = artifact.body
        if (!title) throw new Error('General Grill writeup title is required')
        if (!deps.createDoc) throw new Error('Doc creation is unavailable')
        const docId = crypto.randomUUID()
        deps.createDoc({
          id: docId,
          title,
          body,
          createdBy: current.createdBy,
          createdAt: now,
        })
        sqlite
          .prepare(
            `UPDATE grill SET draft_artifacts = ?, updated_at = ? WHERE id = ?`,
          )
          .run(
            encodeDraftArtifacts(
              current.issueProposal,
              current.draftArtifacts,
              current.initialRequest,
              docId,
              current.sessionBranch,
              current.writeup,
            ),
            now,
            grillId,
          )
        return selectGrill(sqlite, grillId)
      }

      if (!('files' in artifact))
        throw new Error('Code Grill requires materialize files')
      if (!current.repository || !current.baseRef)
        throw new Error('Code Grill is missing repository binding')
      if (!deps.materializeCodeGrill)
        throw new Error('Code Grill materialize is unavailable')
      const files = artifact.files
      if (!Array.isArray(files) || files.length === 0)
        throw new Error('Code Grill requires materialize files')
      for (const file of files) {
        if (!file.path.trim()) throw new Error('Invalid materialize file path')
      }
      const branch = `sweat/grill/${grillId}`
      const published = await deps.materializeCodeGrill({
        grillId,
        repository: current.repository,
        baseRef: current.baseRef,
        branch,
        files,
      })
      sqlite
        .prepare(
          `UPDATE grill SET draft_artifacts = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          encodeDraftArtifacts(
            current.issueProposal,
            current.draftArtifacts,
            current.initialRequest,
            current.docId,
            published.branch,
            current.writeup,
          ),
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
