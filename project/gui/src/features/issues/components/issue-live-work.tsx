import {
  RunActivityContent,
  type ActivityRun,
} from '#/features/runs/run-activity-rail'
import type { Step } from '#/features/runs/step-label'
import { toast } from '#/components/ui/toast'
import type { IssueRun } from '../types'
import {
  useCancelIssueRun,
  useIssueRunSteps,
  type IssueRunStep,
} from '../use-issue-runs'

function toActivityStep(step: IssueRunStep): Step {
  return {
    id: step.id,
    runId: step.runId,
    roomId: '',
    idx: step.idx,
    kind: step.kind,
    ...(step.tool === undefined ? {} : { tool: step.tool }),
    ...(step.callId === undefined ? {} : { callId: step.callId }),
    text: step.text,
    createdAt: step.createdAt,
  }
}

function toActivityRun(run: IssueRun): ActivityRun {
  return {
    id: run.id,
    roomId: '',
    agentId: run.agentId,
    provider: run.provider,
    model: run.model,
    task: run.task,
    requestedBy: { name: 'Workspace' },
    state: run.state,
    ...(run.error === undefined ? {} : { error: run.error }),
    stdout: run.stdout,
    stderr: run.stderr,
    output: run.stdout,
    waitingOn: run.waitingOn,
    preparation: run.preparation,
    sandboxId: run.sandboxId,
  }
}

export function IssueLiveWork({
  run,
  onOpenMachine,
}: {
  run: IssueRun
  onOpenMachine?: (sandboxId: string) => void
}) {
  const {
    data: steps = [],
    isPending,
    isError,
    error,
    refetch,
  } = useIssueRunSteps(run.id)
  const cancelRun = useCancelIssueRun()

  const cancel = async () => {
    try {
      await cancelRun.mutateAsync(run.id)
      toast.add({
        type: 'success',
        title: 'Run cancelled',
      })
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not cancel run',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <RunActivityContent
        run={toActivityRun(run)}
        steps={steps.map(toActivityStep)}
        loading={isPending}
        error={
          isError
            ? error instanceof Error
              ? error.message
              : 'Could not load run activity'
            : undefined
        }
        onRetry={() => void refetch()}
        onCancel={() => void cancel()}
        onOpenMachine={onOpenMachine}
      />
    </div>
  )
}
