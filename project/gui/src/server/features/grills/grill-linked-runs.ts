import { DEFAULT_WARM_IDLE_TTL_MS } from '../../../../../runs'
import type { Step } from '../../../../../runs'
import type { RunSummary } from '#/server/features/runs/run-control'

export type GrillLatestStep = {
  kind: Step['kind']
  tool?: string
  text: string
  at: number
}

/** Warm spine stay `running` between turns; `turnActive` means a turn is in flight. */
export type GrillLinkedRunView = RunSummary & { turnActive: boolean }

export type GrillLinkedRuns = {
  start(input: {
    grillId: string
    task: string
    agentDefinitionId: string
  }): RunSummary
  followUp(grillId: string, task: string): Promise<RunSummary | undefined>
  dispose(grillId: string): Promise<void>
  getRunId(grillId: string): string | undefined
  getLinkedRun(grillId: string): GrillLinkedRunView | undefined
  getLatestStep(grillId: string): GrillLatestStep | undefined
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
  getRun: (runId: string) => RunSummary | undefined
  subscribe: (listener: (run: RunSummary) => void) => () => void
  subscribeSteps: (listener: (runId: string, step: Step) => void) => () => void
  onActivity?: (
    grillId: string,
    activity: {
      linkedRun: GrillLinkedRunView
      latestStep?: GrillLatestStep
    },
  ) => void
}): GrillLinkedRuns {
  const byGrill = new Map<string, string>()
  const grillByRun = new Map<string, string>()
  const latestStepByGrill = new Map<string, GrillLatestStep>()
  const followUpInFlight = new Set<string>()

  const publishActivity = (grillId: string) => {
    if (!deps.onActivity) return
    const linkedRun = getLinkedRunView(grillId)
    if (!linkedRun) return
    deps.onActivity(grillId, {
      linkedRun,
      ...(latestStepByGrill.has(grillId)
        ? { latestStep: latestStepByGrill.get(grillId) }
        : {}),
    })
  }

  const isTurnActive = (grillId: string, run: RunSummary): boolean => {
    if (followUpInFlight.has(grillId)) return true
    if (run.state === 'preparing') return true
    return run.turnActive === true
  }

  const getLinkedRunView = (grillId: string): GrillLinkedRunView | undefined => {
    const runId = byGrill.get(grillId)
    if (!runId) return undefined
    const run = deps.getRun(runId)
    if (!run) return undefined
    return { ...run, turnActive: isTurnActive(grillId, run) }
  }

  deps.subscribeSteps((runId, step) => {
    const grillId = grillByRun.get(runId)
    if (!grillId) return
    latestStepByGrill.set(grillId, {
      kind: step.kind,
      ...(step.tool !== undefined ? { tool: step.tool } : {}),
      text: step.text,
      at: step.at,
    })
    publishActivity(grillId)
  })

  deps.subscribe((run) => {
    const grillId = grillByRun.get(run.id)
    if (!grillId) return
    publishActivity(grillId)
  })

  const remember = (grillId: string, runId: string) => {
    const previous = byGrill.get(grillId)
    if (previous) grillByRun.delete(previous)
    byGrill.set(grillId, runId)
    grillByRun.set(runId, grillId)
  }

  return {
    start: ({ grillId, task, agentDefinitionId }) => {
      const existing = byGrill.get(grillId)
      if (existing) void deps.cancel(existing)
      followUpInFlight.delete(grillId)
      latestStepByGrill.delete(grillId)
      const run = deps.startWarm({
        grillId,
        task,
        agentDefinitionId,
        idleTtlMs: DEFAULT_WARM_IDLE_TTL_MS,
        onCreate: (summary) => {
          remember(grillId, summary.id)
          return summary
        },
      })
      remember(grillId, run.id)
      publishActivity(grillId)
      return run
    },
    followUp: async (grillId, task) => {
      const runId = byGrill.get(grillId)
      if (!runId) return undefined
      const previousOutput = deps.getRun(runId)?.stdout ?? ''
      // Drop the previous turn's step so the UI shows "working" until new
      // steps stream in for this follow-up.
      latestStepByGrill.delete(grillId)
      followUpInFlight.add(grillId)
      publishActivity(grillId)
      try {
        const run = await deps.followUp(runId, task)
        const output = run?.stdout ?? ''
        const finalAnswer = output.startsWith(previousOutput)
          ? output.slice(previousOutput.length)
          : output
        // ponytail: retained stdout tail is enough; persist turns if exact transcripts matter.
        if (
          byGrill.get(grillId) === runId &&
          finalAnswer.trim() &&
          latestStepByGrill.get(grillId)?.kind !== 'message'
        ) {
          latestStepByGrill.set(grillId, {
            kind: 'message',
            text: finalAnswer,
            at: Date.now(),
          })
        }
        return run
      } finally {
        followUpInFlight.delete(grillId)
        publishActivity(grillId)
      }
    },
    dispose: async (grillId) => {
      const runId = byGrill.get(grillId)
      byGrill.delete(grillId)
      latestStepByGrill.delete(grillId)
      followUpInFlight.delete(grillId)
      if (runId) {
        grillByRun.delete(runId)
        await deps.cancel(runId)
      }
    },
    getRunId: (grillId) => byGrill.get(grillId),
    getLinkedRun: (grillId) => getLinkedRunView(grillId),
    getLatestStep: (grillId) => latestStepByGrill.get(grillId),
  }
}
