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
  const byRun = new Map<string, StepArrival[]>()
  for (const arrival of batch) {
    const arrivals = byRun.get(arrival.runId)
    if (arrivals) arrivals.push(arrival)
    else byRun.set(arrival.runId, [arrival])
  }
  for (const [runId, arrivals] of byRun) {
    const steps = [...(current.get(runId) ?? [])]
    const indexes = new Map(steps.map((step, index) => [step.id, index]))
    for (const { step } of arrivals) {
      const index = indexes.get(step.id)
      if (index == null) {
        indexes.set(step.id, steps.length)
        steps.push(step)
      } else steps[index] = step
    }
    next.set(runId, steps)
  }
  return next
}
