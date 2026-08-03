import { stepLabel, type Step } from './step-label'
import type { RoomRun } from '#/features/rooms/types'
import { rosterPerson } from '../../../../agents/roster-people'

export type RunState = 'preparing' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export const terminal = (state: RunState) =>
  state === 'succeeded' || state === 'failed' || state === 'cancelled'

export const agentName = (agentId: string) =>
  rosterPerson(agentId)?.name ?? agentId

export function runStatus(run: RoomRun, step?: Step) {
  if (step) return stepLabel(step)
  return run.state === 'preparing' ? 'is preparing' : 'is working'
}
