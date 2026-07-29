import type { RunExecutor, RunInput, RunRecord, Step } from '../../../runs'

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

export type { Step }

export interface RunControl {
  listRuns(): RunSummary[]
  subscribe(listener: (run: RunSummary) => void): () => void
  subscribeSteps(listener: (runId: string, step: Step) => void): () => void
  start(task: string, context: { roomId: string }): string
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
  options?: { capability?: { tools: readonly string[]; expiresInMs?: number } },
): RunControl {
  return {
    listRuns: () => executor.listRuns().map(runSummary),
    subscribe: (listener) =>
      executor.subscribe((run) => listener(runSummary(run))),
    subscribeSteps: (listener) => executor.subscribeSteps(listener),
    start: (task, context) => {
      const capability = options?.capability
      const hasTools = capability && capability.tools.length > 0
      return executor.startRun({
        agentDefinitionId: 'software-engineer',
        task,
        ...(hasTools
          ? {
              grantContext: { roomId: context.roomId },
              capabilityGrant: {
                tools: [...capability.tools],
                expiresAt: new Date(Date.now() + (capability.expiresInMs ?? 30 * 60 * 1000)),
              },
            }
          : {}),
      })
    },
    cancel: async (runId) => {
      const run = await executor.cancelRun(runId)
      return run ? runSummary(run) : undefined
    },
  }
}
