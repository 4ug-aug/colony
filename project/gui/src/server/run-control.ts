import type { RunInput, RunRecord, Step } from '../../../runs'
import type { WorkspaceAgentExecutor } from '../../../agents/software-engineer'
import {
  ANTBOY_ID,
  SOFTWARE_ENGINEER_ID,
} from '../../../agents/software-engineer'
import type { AttachmentInput } from '../../../inputs/repository'

export type RunProvider = 'openai' | 'custom' | 'cursor'

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
  provider: RunProvider
  model: string
}

export type { Step }

export type RunStartContext<Output> =
  | {
      roomId: string
      agentDefinitionId?: string
      attachments?: readonly AttachmentInput[]
      onCreate: (run: RunSummary) => NonNullable<Output>
    }
  | {
      scheduleId: string
      agentDefinitionId?: string
      onCreate: (run: RunSummary) => NonNullable<Output>
    }

export interface RunControl {
  subscribe(listener: (run: RunSummary) => void): () => void
  subscribeSteps(listener: (runId: string, step: Step) => void): () => void
  start<Output>(
    task: string,
    context: RunStartContext<Output>,
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
  const kind = run.definition.runtime?.kind
  const cursor = run.definition.runtime?.cursor
  const model = run.definition.runtime?.model
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
    provider:
      kind === 'cursor' || cursor
        ? 'cursor'
        : (model?.provider ?? 'openai'),
    model: cursor?.model ?? model?.model ?? '',
  }
}

type RunControlExecutor = Pick<
  WorkspaceAgentExecutor,
  'startRun' | 'subscribe' | 'subscribeSteps' | 'cancelRun'
>

export function createRunControl(executor: RunControlExecutor): RunControl {
  return {
    subscribe: (listener) =>
      executor.subscribe((run) => listener(runSummary(run))),
    subscribeSteps: (listener) => executor.subscribeSteps(listener),
    start: <Output>(
      task: string,
      context: RunStartContext<Output>,
    ): NonNullable<Output> => {
      let created: NonNullable<Output> | undefined
      const agentDefinitionId =
        context.agentDefinitionId ?? SOFTWARE_ENGINEER_ID
      executor.startRun({
        task,
        agentDefinitionId,
        grantContext:
          'roomId' in context
            ? { roomId: context.roomId, agentDefinitionId }
            : { scheduleId: context.scheduleId, agentDefinitionId },
        ...('roomId' in context && context.attachments
          ? { attachments: context.attachments }
          : {}),
        onCreate: (run) => {
          const registered = context.onCreate(runSummary(run))
          if (registered === undefined)
            throw new Error('Agent run was not created')
          created = registered
        },
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

export { ANTBOY_ID, SOFTWARE_ENGINEER_ID }
