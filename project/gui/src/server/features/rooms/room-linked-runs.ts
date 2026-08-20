import { rosterMentionHandles } from '#project/agents/roster'
import { DEFAULT_WARM_IDLE_TTL_MS } from '#project/runs'
import type { AttachmentInput } from '#project/inputs/repository'
import type { RunSummary } from '#/server/features/runs/run-control'
import type { RoomMessage, RoomRun, RoomUser } from './room-store'

export const roomRunIsLive = (state: RunSummary['state']) =>
  state === 'preparing' || state === 'running'

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function mentionedAgentIds(text: string): string[] {
  const ids = [...rosterMentionHandles()].map(escaped).join('|')
  if (!ids) return []
  const found: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(new RegExp(`(?:^|\\s)@(${ids})\\b`, 'g'))) {
    const id = match[1]
    if (!id || seen.has(id)) continue
    seen.add(id)
    found.push(id)
  }
  return found
}

export function mentionTaskFor(text: string, agentDefinitionId: string): string {
  return text
    .replace(
      new RegExp(`(^|\\s)@${escaped(agentDefinitionId)}\\b\\s*`),
      (_, prefix: string) => prefix,
    )
    .trim()
}

export type RoomMentionDispatch = {
  message: RoomMessage
  requestedBy: RoomUser
  attachments?: readonly AttachmentInput[]
  invokerAgentId?: string
}

export type RoomLinkedRuns = {
  dispatch(input: RoomMentionDispatch): RoomRun[]
  getLinkedRun(
    threadRootId: string,
    agentDefinitionId: string,
  ): RoomRun | undefined
}

type QueuedTurn = {
  task: string
  pingInvokerKey?: string
}

type Slot = {
  runId: string
  roomRun: RoomRun
  pendingTurn: boolean
  queue: QueuedTurn[]
  currentPingInvokerKey?: string
}

function keyFor(threadRootId: string, agentDefinitionId: string): string {
  return `${threadRootId}\0${agentDefinitionId}`
}

function threadRootIdFor(message: RoomMessage): string {
  return message.rootId ?? message.id
}

function resultText(run: RunSummary, priorStdout: string): string {
  const output = run.stdout ?? ''
  const delta = output.startsWith(priorStdout)
    ? output.slice(priorStdout.length)
    : output
  return (
    delta.trim() ||
    (run.state === 'failed' ? (run.error ?? 'The run failed.') : '') ||
    (run.state === 'cancelled' ? 'The run was cancelled.' : '') ||
    'Completed.'
  )
}

export function createRoomLinkedRuns(deps: {
  startWarm: (input: {
    roomId: string
    rootId: string
    threadReadRootId?: string
    triggerMessageId: string
    requestedBy: RoomUser
    task: string
    agentDefinitionId: string
    idleTtlMs: number
    attachments?: readonly AttachmentInput[]
  }) => RoomRun
  followUp: (runId: string, task: string) => Promise<RunSummary | undefined>
  getRun: (runId: string) => RunSummary | undefined
  subscribe: (listener: (run: RunSummary) => void) => () => void
  agentReady?: (agentDefinitionId?: string) => boolean
}): RoomLinkedRuns {
  const slots = new Map<string, Slot>()
  const keyByRun = new Map<string, string>()
  const previousStdout = new Map<string, string>()
  const followUpInFlight = new Set<string>()

  const liveSlot = (key: string): Slot | undefined => {
    const slot = slots.get(key)
    if (!slot) return undefined
    const run = deps.getRun(slot.runId)
    if (!run || !roomRunIsLive(run.state)) {
      slots.delete(key)
      keyByRun.delete(slot.runId)
      return undefined
    }
    return slot
  }

  const beginTurn = (slot: Slot, pingInvokerKey?: string) => {
    slot.pendingTurn = true
    slot.currentPingInvokerKey = pingInvokerKey
    previousStdout.set(slot.runId, deps.getRun(slot.runId)?.stdout ?? '')
  }

  const enqueueFollowUp = (slot: Slot, item: QueuedTurn) => {
    followUpInFlight.add(slot.runId)
    beginTurn(slot, item.pingInvokerKey)
    void deps
      .followUp(slot.runId, item.task)
      .then((run) => {
        if (run && slots.get(keyByRun.get(slot.runId) ?? '')?.runId === slot.runId)
          completeTurn(slot.runId, run)
      })
      .finally(() => {
        followUpInFlight.delete(slot.runId)
      })
  }

  const pingInvoker = (invokerKey: string, task: string) => {
    const invoker = liveSlot(invokerKey)
    if (!invoker) return
    if (invoker.pendingTurn) {
      invoker.queue.push({ task })
      return
    }
    enqueueFollowUp(invoker, { task })
  }

  const completeTurn = (runId: string, run: RunSummary) => {
    const key = keyByRun.get(runId)
    if (!key) return
    const slot = slots.get(key)
    if (!slot || slot.runId !== runId || !slot.pendingTurn) return
    slot.pendingTurn = false
    const pingKey = slot.currentPingInvokerKey
    slot.currentPingInvokerKey = undefined
    const prior = previousStdout.get(runId) ?? ''
    previousStdout.set(runId, run.stdout ?? '')
    if (pingKey) pingInvoker(pingKey, resultText(run, prior))
    const next = slot.queue.shift()
    if (next) enqueueFollowUp(slot, next)
  }

  deps.subscribe((run) => {
    if (followUpInFlight.has(run.id)) return
    if (run.state === 'preparing' || run.turnActive === true) return
    completeTurn(run.id, run)
  })

  const startSlot = (
    key: string,
    agentDefinitionId: string,
    item: QueuedTurn,
    input: RoomMentionDispatch,
  ): RoomRun => {
    const { message, requestedBy, attachments } = input
    const threadRootId = threadRootIdFor(message)
    const run = deps.startWarm({
      roomId: message.roomId,
      rootId: threadRootId,
      ...(message.rootId ? { threadReadRootId: message.rootId } : {}),
      triggerMessageId: message.id,
      requestedBy,
      task: item.task,
      agentDefinitionId,
      idleTtlMs: DEFAULT_WARM_IDLE_TTL_MS,
      ...(attachments ? { attachments } : {}),
    })
    const slot: Slot = {
      runId: run.id,
      roomRun: run,
      pendingTurn: true,
      queue: [],
      ...(item.pingInvokerKey ? { currentPingInvokerKey: item.pingInvokerKey } : {}),
    }
    const previous = slots.get(key)
    if (previous) keyByRun.delete(previous.runId)
    slots.set(key, slot)
    keyByRun.set(run.id, key)
    previousStdout.set(run.id, '')
    const started = deps.getRun(run.id)
    if (
      started &&
      started.turnActive === false &&
      started.state !== 'preparing'
    )
      completeTurn(run.id, started)
    return run
  }

  return {
    dispatch(input) {
      const { message, invokerAgentId } = input
      const threadRootId = threadRootIdFor(message)
      const invokerKey = invokerAgentId
        ? keyFor(threadRootId, invokerAgentId)
        : undefined
      const runs: RoomRun[] = []
      for (const agentDefinitionId of mentionedAgentIds(message.text)) {
        if (agentDefinitionId === invokerAgentId) continue
        if (deps.agentReady && !deps.agentReady(agentDefinitionId)) continue
        const task = mentionTaskFor(message.text, agentDefinitionId)
        if (!task) continue
        const key = keyFor(threadRootId, agentDefinitionId)
        const item: QueuedTurn = {
          task,
          ...(invokerKey ? { pingInvokerKey: invokerKey } : {}),
        }
        const existing = liveSlot(key)
        if (!existing) {
          runs.push(startSlot(key, agentDefinitionId, item, input))
          continue
        }
        runs.push(existing.roomRun)
        if (existing.pendingTurn) existing.queue.push(item)
        else enqueueFollowUp(existing, item)
      }
      return runs
    },
    getLinkedRun(threadRootId, agentDefinitionId) {
      return liveSlot(keyFor(threadRootId, agentDefinitionId))?.roomRun
    },
  }
}
