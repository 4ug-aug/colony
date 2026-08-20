import { stepLabel, type Step } from './step-label'
import type { RoomRun } from '#/features/rooms/types'
import type { RunState } from '#project/runs'

export type { RunState }

export const terminal = (state: RunState) =>
  state === 'succeeded' || state === 'failed' || state === 'cancelled'

export function runStatus(run: RoomRun, step?: Step) {
  if (step) return stepLabel(step)
  if (run.waitingOn)
    return `is ${run.waitingOn.charAt(0).toLowerCase()}${run.waitingOn.slice(1)}`
  return run.state === 'preparing' ? 'is preparing' : 'is working'
}
