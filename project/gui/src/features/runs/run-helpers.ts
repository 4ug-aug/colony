import { stepLabel, type Step } from './step-label'
import type { RoomRun } from '#/features/rooms/types'
import type { RunState } from '#project/runs'

export type { RunState }

export const terminal = (state: RunState) =>
  state === 'succeeded' || state === 'failed' || state === 'cancelled'

/**
 * Warm Room/Chat/Grill spines stay `running` between turns. A turn is in
 * flight only while preparing, `turnActive`, or still producing a first result.
 */
export function runTurnInFlight(
  run: Pick<RoomRun, 'state' | 'exitCode' | 'stdout'> & {
    output?: string
    turnActive?: boolean
  },
): boolean {
  if (run.state === 'preparing') return true
  if (terminal(run.state)) return false
  if (run.turnActive === true) return true
  if (run.turnActive === false) return false
  return !(run.exitCode === 0 && Boolean((run.output ?? run.stdout)?.trim()))
}

export function runStatus(run: RoomRun, step?: Step) {
  if (!runTurnInFlight(run)) {
    if (run.state === 'failed') return 'failed'
    if (run.state === 'cancelled') return 'cancelled'
    return 'completed'
  }
  if (step) return stepLabel(step)
  if (run.waitingOn)
    return `is ${run.waitingOn.charAt(0).toLowerCase()}${run.waitingOn.slice(1)}`
  return run.state === 'preparing' ? 'is preparing' : 'is working'
}
