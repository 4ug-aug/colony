import type { RunControl, RunSummary } from './run-control'
import {
  createOneshotStore,
  type OneshotRun,
  type OneshotRunStep,
  type OneshotStore,
} from './oneshot-store'

export class OneshotActiveRunError extends Error {
  constructor() {
    super('A Oneshot run is already active')
    this.name = 'OneshotActiveRunError'
  }
}

export type OneshotRunner = {
  start(input: {
    accountId: string
    task: string
    agentDefinitionId: string
    repositoryBase?: string
  }): OneshotRun
  cancel(runId: string, accountId: string): Promise<OneshotRun | undefined>
  discard(runId: string, accountId: string): Promise<OneshotRun | undefined>
  get(runId: string, accountId: string): OneshotRun | undefined
  listSteps(runId: string, accountId: string): OneshotRunStep[] | undefined
  activeForAccount(accountId: string): OneshotRun | undefined
  stop(): void
}

export function createOneshotRunner(options: {
  store?: OneshotStore
  control: RunControl
  onRunCreated?: (run: OneshotRun) => void
  onRunChange?: (run: OneshotRun) => void
  onStep?: (step: OneshotRunStep) => void
  onDiscarded?: (run: OneshotRun) => void
}): OneshotRunner {
  const store = options.store ?? createOneshotStore()

  const project = (summary: RunSummary): void => {
    const existing = store.getRun(summary.id)
    if (!existing) return
    const changed: OneshotRun = { ...existing, ...summary }
    store.updateRun(changed)
    options.onRunChange?.(changed)
  }

  const unsubscribe = options.control.subscribe(project)
  const unsubscribeSteps = options.control.subscribeSteps((runId, step) => {
    const run = store.getRun(runId)
    if (!run) return
    const stored: OneshotRunStep = {
      id: crypto.randomUUID(),
      runId,
      idx: store.listSteps(runId).length,
      kind: step.kind,
      ...(step.tool === undefined ? {} : { tool: step.tool }),
      ...(step.callId === undefined ? {} : { callId: step.callId }),
      text: step.text,
      createdAt: step.at,
      at: step.at,
    }
    store.appendStep(stored)
    options.onStep?.(stored)
  })

  return {
    start(input) {
      if (store.activeRunForAccount(input.accountId))
        throw new OneshotActiveRunError()
      const oneshotId = crypto.randomUUID()
      try {
        return options.control.start(input.task.trim(), {
          oneshotId,
          agentDefinitionId: input.agentDefinitionId,
          ...(input.repositoryBase
            ? { repositoryBase: input.repositoryBase.trim() || undefined }
            : {}),
          onCreate: (summary) => {
            const created = store.createRun({
              ...summary,
              oneshotId,
              accountId: input.accountId,
              ...(input.repositoryBase
                ? { repositoryBase: input.repositoryBase.trim() }
                : {}),
            })
            if (!created) throw new OneshotActiveRunError()
            options.onRunCreated?.(created)
            return created
          },
        })
      } catch (error) {
        if (error instanceof OneshotActiveRunError) throw error
        throw error
      }
    },
    async cancel(runId, accountId) {
      const existing = store.getRunForAccount(runId, accountId)
      if (!existing) return undefined
      const summary = await options.control.cancel(runId)
      if (!summary) return existing
      const changed: OneshotRun = { ...existing, ...summary }
      store.updateRun(changed)
      options.onRunChange?.(changed)
      return changed
    },
    async discard(runId, accountId) {
      const existing = store.getRunForAccount(runId, accountId)
      if (!existing) return undefined
      if (existing.state === 'preparing' || existing.state === 'running')
        await options.control.cancel(runId)
      const removed = store.discard(runId, accountId)
      if (removed) options.onDiscarded?.(removed)
      return removed
    },
    get(runId, accountId) {
      return store.getRunForAccount(runId, accountId)
    },
    listSteps(runId, accountId) {
      if (!store.getRunForAccount(runId, accountId)) return undefined
      return store.listSteps(runId)
    },
    activeForAccount(accountId) {
      return store.activeRunForAccount(accountId)
    },
    stop() {
      unsubscribe()
      unsubscribeSteps()
    },
  }
}
