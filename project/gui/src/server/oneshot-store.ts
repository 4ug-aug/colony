import type { RunSummary } from './run-control'
import type { Step } from '../../../runs'

export type OneshotRunStep = Step & {
  id: string
  runId: string
  idx: number
  createdAt: number
}

export type OneshotRun = RunSummary & {
  oneshotId: string
  accountId: string
  repositoryBase?: string
}

export type OneshotStore = {
  createRun(run: OneshotRun): OneshotRun | undefined
  updateRun(run: OneshotRun): void
  getRun(runId: string): OneshotRun | undefined
  getRunForAccount(runId: string, accountId: string): OneshotRun | undefined
  activeRunForAccount(accountId: string): OneshotRun | undefined
  discard(runId: string, accountId: string): OneshotRun | undefined
  appendStep(step: OneshotRunStep): void
  listSteps(runId: string): OneshotRunStep[]
}

const active = (state: OneshotRun['state']): boolean =>
  state === 'preparing' || state === 'running'

export function createOneshotStore(): OneshotStore {
  const runs = new Map<string, OneshotRun>()
  const steps = new Map<string, OneshotRunStep[]>()

  return {
    createRun(run) {
      if (active(run.state)) {
        for (const existing of runs.values()) {
          if (existing.accountId === run.accountId && active(existing.state))
            return undefined
        }
      }
      runs.set(run.id, run)
      steps.set(run.id, [])
      return run
    },
    updateRun(run) {
      if (!runs.has(run.id)) return
      runs.set(run.id, run)
    },
    getRun(runId) {
      return runs.get(runId)
    },
    getRunForAccount(runId, accountId) {
      const run = runs.get(runId)
      return run?.accountId === accountId ? run : undefined
    },
    activeRunForAccount(accountId) {
      for (const run of runs.values()) {
        if (run.accountId === accountId && active(run.state)) return run
      }
      return undefined
    },
    discard(runId, accountId) {
      const run = runs.get(runId)
      if (!run || run.accountId !== accountId) return undefined
      runs.delete(runId)
      steps.delete(runId)
      return run
    },
    appendStep(step) {
      const list = steps.get(step.runId)
      if (!list) return
      list.push(step)
    },
    listSteps(runId) {
      return [...(steps.get(runId) ?? [])]
    },
  }
}
