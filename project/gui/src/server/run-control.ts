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
  subscribe(listener: (run: RunSummary) => void): () => void
  subscribeSteps(listener: (runId: string, step: Step) => void): () => void
  start<Output>(
    task: string,
    context: { roomId: string; onCreate: (run: RunSummary) => NonNullable<Output> },
  ): NonNullable<Output>
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
    subscribe: (listener) =>
      executor.subscribe((run) => listener(runSummary(run))),
    subscribeSteps: (listener) => executor.subscribeSteps(listener),
    start: <Output>(
      task: string,
      context: {
        roomId: string
        onCreate: (run: RunSummary) => NonNullable<Output>
      },
    ): NonNullable<Output> => {
      let created: NonNullable<Output> | undefined
      const capability = options?.capability
      const hasTools = capability && capability.tools.length > 0
      executor.startRun({
        agentDefinitionId: 'software-engineer',
        task,
        onCreate: (run) => {
          const registered = context.onCreate(runSummary(run))
          if (registered === undefined) throw new Error('Agent run was not created')
          created = registered
        },
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
      if (created === undefined) throw new Error('Agent run was not created')
      return created
    },
    cancel: async (runId) => {
      const run = await executor.cancelRun(runId)
      return run ? runSummary(run) : undefined
    },
  }
}
