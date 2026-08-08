import { DEFAULT_WARM_IDLE_TTL_MS } from '../../../runs'
import type { RunSummary } from './run-control'

export type GrillLinkedRuns = {
  start(input: {
    grillId: string
    task: string
    agentDefinitionId: string
  }): RunSummary
  followUp(grillId: string, task: string): Promise<RunSummary | undefined>
  dispose(grillId: string): Promise<void>
  getRunId(grillId: string): string | undefined
}

/**
 * Maps Grills to warm Run ids. Durable Grill state stays on GrillStore;
 * this only tracks the live warm spine (ADR 0020).
 */
export function createGrillLinkedRuns(deps: {
  startWarm: (input: {
    grillId: string
    task: string
    agentDefinitionId: string
    idleTtlMs: number
    onCreate: (run: RunSummary) => RunSummary
  }) => RunSummary
  followUp: (runId: string, task: string) => Promise<RunSummary | undefined>
  cancel: (runId: string) => Promise<unknown>
}): GrillLinkedRuns {
  const byGrill = new Map<string, string>()
  return {
    start: ({ grillId, task, agentDefinitionId }) => {
      const existing = byGrill.get(grillId)
      if (existing) void deps.cancel(existing)
      const run = deps.startWarm({
        grillId,
        task,
        agentDefinitionId,
        idleTtlMs: DEFAULT_WARM_IDLE_TTL_MS,
        onCreate: (summary) => {
          byGrill.set(grillId, summary.id)
          return summary
        },
      })
      byGrill.set(grillId, run.id)
      return run
    },
    followUp: async (grillId, task) => {
      const runId = byGrill.get(grillId)
      if (!runId) return undefined
      return deps.followUp(runId, task)
    },
    dispose: async (grillId) => {
      const runId = byGrill.get(grillId)
      byGrill.delete(grillId)
      if (runId) await deps.cancel(runId)
    },
    getRunId: (grillId) => byGrill.get(grillId),
  }
}
