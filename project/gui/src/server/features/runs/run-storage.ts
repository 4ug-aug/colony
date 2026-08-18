import type { Step, StepKind } from '../../../../../runs'
import type { Sqlite } from '#/server/sqlite'

/** A run step as stored: the runtime's wire Step plus its persisted identity. */
export type RunStep = Step & {
  id: string
  runId: string
  idx: number
  createdAt: number
}

/**
 * Per-domain step tables. Identical in shape; separate only so each can cascade
 * from its own run table. A union rather than `string` — the name is
 * interpolated into SQL, so it must come from this list.
 */
export type RunStepTable = 'issue_run_step' | 'schedule_run_step'

export type RunTable = 'room_run' | 'issue_run' | 'schedule_run'

export interface RunStepStore {
  appendStep(step: RunStep): void
  listSteps(runId: string): RunStep[]
}

type StepRow = {
  id: string
  run_id: string
  idx: number
  kind: StepKind
  tool: string | null
  call_id: string | null
  text: string
  created_at: number
}

const STEP_COLUMNS = 'id, run_id, idx, kind, tool, call_id, text, created_at'

const stepFrom = (row: StepRow): RunStep => ({
  id: row.id,
  runId: row.run_id,
  idx: row.idx,
  kind: row.kind,
  ...(row.tool === null ? {} : { tool: row.tool }),
  ...(row.call_id === null ? {} : { callId: row.call_id }),
  text: row.text,
  createdAt: row.created_at,
  at: row.created_at,
})

/** Build a storable step from what the executor emits. */
export const runStep = (runId: string, idx: number, step: Step): RunStep => ({
  id: crypto.randomUUID(),
  runId,
  idx,
  kind: step.kind,
  ...(step.tool === undefined ? {} : { tool: step.tool }),
  ...(step.callId === undefined ? {} : { callId: step.callId }),
  text: step.text,
  createdAt: step.at,
  at: step.at,
})

/**
 * Steps for one domain's table. Rooms writes its own INSERT — `run_step` carries
 * an extra `room_id` — but shares `RunStep` and `runStep`.
 */
export function createRunStepStore(
  sqlite: Sqlite,
  table: RunStepTable,
): RunStepStore {
  const insert = `INSERT INTO ${table} (${STEP_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  const select = `SELECT ${STEP_COLUMNS} FROM ${table} WHERE run_id = ? ORDER BY idx`
  return {
    appendStep: (step) => {
      sqlite
        .prepare(insert)
        .run(
          step.id,
          step.runId,
          step.idx,
          step.kind,
          step.tool ?? null,
          step.callId ?? null,
          step.text,
          step.createdAt,
        )
    },
    listSteps: (runId) =>
      (sqlite.prepare(select).all(runId) as StepRow[]).map(stepFrom),
  }
}

export const STALE_RUN_ERROR = 'Server restarted before the run completed.'

/**
 * Ids of runs a previous process left active, now marked failed. Ids are
 * collected before the UPDATE so the caller gets exactly this sweep's runs
 * rather than every run that ever went stale.
 */
export function failStaleRuns(
  sqlite: Sqlite,
  table: RunTable,
  now: number,
): string[] {
  const ids = (
    sqlite
      .prepare(
        `SELECT id FROM ${table} WHERE state IN ('preparing', 'running')`,
      )
      .all() as { id: string }[]
  ).map(({ id }) => id)
  if (ids.length === 0) return []
  sqlite
    .prepare(
      `UPDATE ${table} SET state = 'failed', error = ?, completed_at = ? WHERE state IN ('preparing', 'running')`,
    )
    .run(STALE_RUN_ERROR, now)
  return ids
}
