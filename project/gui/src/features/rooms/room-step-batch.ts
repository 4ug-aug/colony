import type { Step } from '#/features/runs/step-label'

/**
 * One `run.step` stream event. `runId` is carried separately because the event
 * envelope supplies it alongside the step rather than relying on `step.runId`.
 */
export type StepArrival = { runId: string; step: Step }

/** Latest step per run, applied in arrival order so the last arrival wins. */
export function mergeLatestSteps(
  current: Map<string, Step>,
  batch: readonly StepArrival[],
): Map<string, Step> {
  if (!batch.length) return current
  const next = new Map(current)
  for (const { runId, step } of batch) next.set(runId, step)
  return next
}

/**
 * Appends each arrival to its run's live step list, replacing a step already
 * present by id. Reads from the map being built rather than from `current`, so
 * several arrivals for the same run inside one batch accumulate instead of
 * each overwriting the last.
 */
export function mergeLiveSteps(
  current: Map<string, Step[]>,
  batch: readonly StepArrival[],
): Map<string, Step[]> {
  if (!batch.length) return current
  const next = new Map(current)
  for (const { runId, step } of batch) {
    const steps = next.get(runId) ?? []
    const index = steps.findIndex(({ id }) => id === step.id)
    next.set(
      runId,
      index < 0
        ? [...steps, step]
        : steps.map((existing) => (existing.id === step.id ? step : existing)),
    )
  }
  return next
}
