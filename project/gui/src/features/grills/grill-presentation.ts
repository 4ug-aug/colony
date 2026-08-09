import { stepLabel } from '#/features/runs/step-label'
import type { GrillLatestStep } from './types'

export const grillEnterClassName =
  'animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out fill-mode-both motion-reduce:animate-none'

export const grillEnterAlertClassName =
  'animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out fill-mode-both motion-reduce:animate-none'

export function grillStepLabel(step: GrillLatestStep): string {
  return stepLabel({
    id: 'latest',
    runId: 'grill',
    roomId: 'grill',
    idx: 0,
    kind: step.kind,
    ...(step.tool !== undefined ? { tool: step.tool } : {}),
    text: step.text,
    createdAt: step.at,
  })
}
