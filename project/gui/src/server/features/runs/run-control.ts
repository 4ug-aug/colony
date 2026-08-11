import type { AgentGrantContext } from '../../../../../agents/grant-context'
import type { RunInput, RunRecord, Step } from '../../../../../runs'
import type { WorkspaceAgentExecutor } from '../../../../../agents/roster'
import { SOFTWARE_ENGINEER_ID } from '../../../../../agents/roster'
import type { AttachmentInput } from '../../../../../inputs/repository'

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
  | 'turnActive'
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
      /** Write destination: the trigger message id for a top-level mention, or the existing thread root for a reply mention. */
      rootId?: string
      /** Set only for a reply mention: scopes workspace.read_messages to this thread root instead of the flat Room. */
      threadReadRootId?: string
      agentDefinitionId?: string
      attachments?: readonly AttachmentInput[]
      onCreate: (run: RunSummary) => NonNullable<Output>
    }
  | {
      scheduleId: string
      agentDefinitionId?: string
      onCreate: (run: RunSummary) => NonNullable<Output>
    }
  | {
      issueId: string
      agentDefinitionId?: string
      repositoryBase?: string
      onCreate: (run: RunSummary) => NonNullable<Output>
    }
  | {
      grillId: string
      agentDefinitionId?: string
      warm?: boolean
      idleTtlMs?: number
      onCreate: (run: RunSummary) => NonNullable<Output>
    }
  | {
      oneshotId: string
      agentDefinitionId?: string
      repositoryBase?: string
      onCreate: (run: RunSummary) => NonNullable<Output>
    }

export interface RunControl {
  subscribe(listener: (run: RunSummary) => void): () => void
  subscribeSteps(listener: (runId: string, step: Step) => void): () => void
  getRun(runId: string): RunSummary | undefined
  start<Output>(
    task: string,
    context: RunStartContext<Output>,
  ): NonNullable<Output>
  followUp(runId: string, task: string): Promise<RunSummary | undefined>
  cancel(runId: string): Promise<RunSummary | undefined>
  stop(): Promise<void>
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
    turnActive,
    error,
    stdout,
    stderr,
    definition: { id: agentId },
  } = run
  const runtime = run.definition.runtime
  const kind = runtime?.kind
  return {
    id,
    task,
    state,
    createdAt,
    startedAt,
    completedAt,
    exitCode,
    turnActive,
    error,
    stdout,
    stderr,
    agentId,
    provider:
      kind === 'cursor'
        ? 'cursor'
        : runtime && 'model' in runtime
          ? (runtime.model.provider ?? 'openai')
          : 'openai',
    model:
      runtime && 'cursor' in runtime
        ? runtime.cursor.model
        : runtime && 'model' in runtime
          ? runtime.model.model
          : '',
  }
}

type RunControlExecutor = Pick<
  WorkspaceAgentExecutor,
  | 'startRun'
  | 'followUp'
  | 'getRun'
  | 'subscribe'
  | 'subscribeSteps'
  | 'cancelRun'
  | 'stop'
>

function grantContextFrom<Output>(
  context: RunStartContext<Output>,
  agentDefinitionId: string,
): AgentGrantContext {
  if ('roomId' in context)
    return {
      roomId: context.roomId,
      agentDefinitionId,
      ...(context.rootId ? { rootId: context.rootId } : {}),
      ...(context.threadReadRootId
        ? { threadReadRootId: context.threadReadRootId }
        : {}),
    }
  if ('scheduleId' in context)
    return { scheduleId: context.scheduleId, agentDefinitionId }
  if ('grillId' in context)
    return { grillId: context.grillId, agentDefinitionId }
  if ('oneshotId' in context)
    return {
      oneshotId: context.oneshotId,
      agentDefinitionId,
      ...(context.repositoryBase
        ? { repositoryBase: context.repositoryBase }
        : {}),
    }
  return {
    issueId: context.issueId,
    agentDefinitionId,
    ...(context.repositoryBase
      ? { repositoryBase: context.repositoryBase }
      : {}),
  }
}

export function createRunControl(executor: RunControlExecutor): RunControl {
  return {
    subscribe: (listener) =>
      executor.subscribe((run) => listener(runSummary(run))),
    subscribeSteps: (listener) => executor.subscribeSteps(listener),
    getRun: (runId) => {
      const run = executor.getRun(runId)
      return run ? runSummary(run) : undefined
    },
    start: <Output>(
      task: string,
      context: RunStartContext<Output>,
    ): NonNullable<Output> => {
      let created: NonNullable<Output> | undefined
      const agentDefinitionId =
        context.agentDefinitionId ?? SOFTWARE_ENGINEER_ID
      const grantContext = grantContextFrom(context, agentDefinitionId)
      executor.startRun({
        task,
        agentDefinitionId,
        grantContext,
        ...('roomId' in context && context.attachments
          ? { attachments: context.attachments }
          : {}),
        ...('grillId' in context
          ? {
              warm: context.warm ?? true,
              ...(context.idleTtlMs !== undefined
                ? { idleTtlMs: context.idleTtlMs }
                : {}),
            }
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
    followUp: async (runId, task) => {
      const run = await executor.followUp(runId, task)
      return run ? runSummary(run) : undefined
    },
    cancel: async (runId) => {
      const run = await executor.cancelRun(runId)
      return run ? runSummary(run) : undefined
    },
    stop: () => executor.stop(),
  }
}
