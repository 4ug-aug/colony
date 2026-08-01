import type { Step } from './step-label'

export type ActivityItem = { step: Step; result?: Step }
export type ActivityGroup =
  | { kind: 'reasoning'; item: ActivityItem }
  | { kind: 'tools'; items: ActivityItem[] }

export function formatStepText(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

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

export function groupActivity(items: ActivityItem[]): ActivityGroup[] {
  const groups: ActivityGroup[] = []

  for (const item of items) {
    if (item.step.kind === 'message') {
      groups.push({ kind: 'reasoning', item })
      continue
    }

    const previous = groups.at(-1)
    if (previous?.kind === 'tools') previous.items.push(item)
    else groups.push({ kind: 'tools', items: [item] })
  }

  return groups
}
