import type { Step } from './step-label'

export function mergeSteps(...groups: Step[][]) {
  const byId = new Map(groups.flat().map((step) => [step.id, step]))
  return [...byId.values()].sort((a, b) => a.idx - b.idx)
}

export function pairSteps(steps: Step[]) {
  const results = new Map(
    steps
      .filter((step) => step.kind === 'tool_result' && step.callId)
      .map((step) => [step.callId!, step]),
  )
  return steps
    .filter((step) => step.kind !== 'tool_result')
    .map((step) =>
      step.kind === 'tool_call'
        ? { step, result: step.callId ? results.get(step.callId) : undefined }
        : { step },
    )
}
