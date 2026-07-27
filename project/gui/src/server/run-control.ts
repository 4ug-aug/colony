import type { RunExecutor, RunInput, RunRecord } from '../../../agents'

export type RunSummary = Pick<
  RunRecord,
  | 'id'
  | 'task'
  | 'state'
  | 'createdAt'
  | 'startedAt'
  | 'completedAt'
  | 'exitCode'
  | 'error'
  | 'stdout'
  | 'stderr'
> & {
  agentId: string
}

export interface RunControl {
  listRuns(): RunSummary[]
  subscribe(listener: (run: RunSummary) => void): () => void
  start(task: string): string
  cancel(runId: string): Promise<RunSummary | undefined>
}

export function runSummary<Input extends RunInput>(
  run: RunRecord<Input>,
): RunSummary {
  const {
    id,
    task,
    state,
    createdAt,
    startedAt,
    completedAt,
    exitCode,
    error,
    stdout,
    stderr,
    definition: { id: agentId },
  } = run
  return {
    id,
    task,
    state,
    createdAt,
    startedAt,
    completedAt,
    exitCode,
    error,
    stdout,
    stderr,
    agentId,
  }
}

export function createRunControl<Input extends RunInput>(
  executor: RunExecutor<Input>,
): RunControl {
  return {
    listRuns: () => executor.listRuns().map(runSummary),
    subscribe: (listener) =>
      executor.subscribe((run) => listener(runSummary(run))),
    start: (task) =>
      executor.startRun({ agentDefinitionId: 'software-engineer', task }),
    cancel: async (runId) => {
      const run = await executor.cancelRun(runId)
      return run ? runSummary(run) : undefined
    },
  }
}
