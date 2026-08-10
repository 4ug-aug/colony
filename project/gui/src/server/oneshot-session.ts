import type { Step } from '../../../runs'
import type { RunControl, RunSummary } from './run-control'

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

export class OneshotActiveRunError extends Error {
  constructor() {
    super('A Oneshot run is already active')
    this.name = 'OneshotActiveRunError'
  }
}

export type OneshotSession = {
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

const isActive = (state: OneshotRun['state']): boolean =>
  state === 'preparing' || state === 'running'

export function createOneshotSession(options: {
  control: RunControl
}): OneshotSession {
  const runs = new Map<string, OneshotRun>()
  const steps = new Map<string, OneshotRunStep[]>()
  const startingAccounts = new Set<string>()

  const getForAccount = (runId: string, accountId: string) => {
    const run = runs.get(runId)
    return run?.accountId === accountId ? run : undefined
  }

  const activeForAccount = (accountId: string) => {
    for (const run of runs.values()) {
      if (run.accountId === accountId && isActive(run.state)) return run
    }
    return undefined
  }

  const project = (summary: RunSummary): void => {
    const existing = runs.get(summary.id)
    if (!existing) return
    runs.set(summary.id, { ...existing, ...summary })
  }

  const unsubscribe = options.control.subscribe(project)
  const unsubscribeSteps = options.control.subscribeSteps((runId, step) => {
    if (!runs.has(runId)) return
    const list = steps.get(runId)
    if (!list) return
    list.push({
      id: crypto.randomUUID(),
      runId,
      idx: list.length,
      kind: step.kind,
      ...(step.tool === undefined ? {} : { tool: step.tool }),
      ...(step.callId === undefined ? {} : { callId: step.callId }),
      text: step.text,
      createdAt: step.at,
      at: step.at,
    })
  })

  return {
    start(input) {
      if (
        startingAccounts.has(input.accountId) ||
        activeForAccount(input.accountId)
      ) {
        throw new OneshotActiveRunError()
      }
      startingAccounts.add(input.accountId)
      try {
        const oneshotId = crypto.randomUUID()
        const repositoryBase = input.repositoryBase?.trim() || undefined
        return options.control.start(input.task.trim(), {
          oneshotId,
          agentDefinitionId: input.agentDefinitionId,
          ...(repositoryBase ? { repositoryBase } : {}),
          onCreate: (summary) => {
            if (activeForAccount(input.accountId))
              throw new OneshotActiveRunError()
            const created: OneshotRun = {
              ...summary,
              oneshotId,
              accountId: input.accountId,
              ...(repositoryBase ? { repositoryBase } : {}),
            }
            runs.set(created.id, created)
            steps.set(created.id, [])
            return created
          },
        })
      } finally {
        startingAccounts.delete(input.accountId)
      }
    },
    async cancel(runId, accountId) {
      const existing = getForAccount(runId, accountId)
      if (!existing) return undefined
      const summary = await options.control.cancel(runId)
      if (!summary) return existing
      const changed: OneshotRun = { ...existing, ...summary }
      runs.set(runId, changed)
      return changed
    },
    async discard(runId, accountId) {
      const existing = getForAccount(runId, accountId)
      if (!existing) return undefined
      if (isActive(existing.state)) await options.control.cancel(runId)
      runs.delete(runId)
      steps.delete(runId)
      return existing
    },
    get: getForAccount,
    listSteps(runId, accountId) {
      if (!getForAccount(runId, accountId)) return undefined
      return [...(steps.get(runId) ?? [])]
    },
    activeForAccount,
    stop() {
      unsubscribe()
      unsubscribeSteps()
    },
  }
}
