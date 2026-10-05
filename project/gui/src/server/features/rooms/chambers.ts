import { isTerminalRunState, type TerminalRunState } from '#project/runs'
import type { RunControl } from '#/server/features/runs/run-control'
import type { Schedule } from '#/server/features/schedules/schedule-store'
import type { SettledScheduleRun } from '#/server/features/schedules/schedule-runner'
import type { RoomMessageHub } from './room-hub'
import type {
  MessageDelivery,
  RoomMessage,
  RoomRun,
  RoomStore,
  RoomSummary,
  RoomUser,
} from './room-store'
import { promptWithHistory } from './run-history'

type Agent = { id: string; name: string; image?: string }
type SettledRun = { state: TerminalRunState; stdout: string; error?: string }

/** A run's outcome as the agent's reply in its Chamber conversation. */
function answer(run: SettledRun): string {
  if (run.state === 'succeeded') return run.stdout.trim() || 'Done.'
  if (run.state === 'cancelled') return 'Run cancelled.'
  return `I couldn't finish this${run.error ? `: ${run.error}` : '.'}`
}

/**
 * Chamber conversations (ADR 0031): every message is a task for the Chamber's
 * agent, answers come back as agent messages, and a message sent while its
 * conversation (the top level, or one thread) has a run is queued behind it.
 */
export function createChambers(deps: {
  store: RoomStore
  messages: RoomMessageHub
  control: RunControl
  agent: (id: string) => Agent
  /** A Chamber was just created for this account. */
  onOpened: (accountId: string, room: RoomSummary) => void
}) {
  const conversationOf = (run: RoomRun) =>
    deps.store.getMessage(run.roomId, run.triggerMessageId)?.rootId
  const busy = (roomId: string, rootId: string | undefined) =>
    // ponytail: scans the Chamber's runs; index active runs if Chambers grow long.
    deps.store
      .listRuns(roomId)
      .some(
        (run) =>
          !isTerminalRunState(run.state) && conversationOf(run) === rootId,
      )

  /** The account's Chamber with this agent, created on first use. */
  const open = (accountId: string, agentId: string): RoomSummary => {
    const { room, created } = deps.store.chamberFor(
      accountId,
      deps.agent(agentId),
    )
    if (created) deps.onOpened(accountId, room)
    return room
  }

  const start = (
    room: RoomSummary,
    triggers: RoomMessage[],
    requestedBy: RoomUser,
  ): RoomRun => {
    const last = triggers.at(-1)!
    const rootId = last.rootId
    const sent = new Set(triggers.map(({ id }) => id))
    const earlier = (
      rootId
        ? deps.messages.listThreadMessages(room.id, rootId)
        : deps.store.listMessages(room.id)
    ).filter((message) => !sent.has(message.id) && !message.queued)
    const task =
      triggers
        .map(({ text }) => text)
        .filter(Boolean)
        .join('\n\n') || 'See the attached files.'
    const attachments = triggers.flatMap(({ attachments }) =>
      attachments.flatMap(({ id }) => {
        const stored = deps.store.getAttachment(id)
        return stored
          ? [
              {
                type: 'attachment' as const,
                id: stored.id,
                roomId: room.id,
                filename: stored.filename,
                byteSize: stored.byteSize,
                sha256: stored.sha256,
              },
            ]
          : []
      }),
    )
    return deps.control.start(
      promptWithHistory(rootId ? 'thread' : 'chamber', earlier, task),
      {
        roomId: room.id,
        // Top-level runs write top-level; thread runs stay in their thread.
        ...(rootId ? { rootId, threadReadRootId: rootId } : {}),
        agentDefinitionId: room.agentDefinitionId!,
        attachments,
        responsibleAccountId: requestedBy.id,
        onCreate: (source) => {
          const run: RoomRun = {
            ...source,
            roomId: room.id,
            triggerMessageId: last.id,
            requestedBy,
          }
          deps.store.createRun(run)
          return run
        },
      },
    )
  }

  const reply = (
    room: RoomSummary,
    agentId: string,
    text: string,
    where: { rootId?: string; delivery?: MessageDelivery } = {},
  ) =>
    deps.messages.postMessage({
      roomId: room.id,
      author: { kind: 'agent', ...deps.agent(agentId) },
      text,
      ...where,
    })

  return {
    /** True when a new message in this conversation must wait for a run. */
    busy,
    open,
    start,
    /** Posts a Chamber run's answer, then sends whatever queued behind it. */
    settled(room: RoomSummary, run: RoomRun & SettledRun) {
      const rootId = conversationOf(run)
      reply(room, run.agentId, answer(run), rootId ? { rootId } : {})
      const queued = deps.store.listQueuedMessages(room.id, rootId)
      if (!queued.length || busy(room.id, rootId)) return
      const sent = deps.messages.sendQueued(
        room.id,
        queued.map(({ id }) => id),
      )
      const author = sent.at(-1)?.author
      if (author?.kind !== 'user') return
      const { kind: _, ...requestedBy } = author
      try {
        start(room, sent, requestedBy)
      } catch (error) {
        reply(
          room,
          room.agentDefinitionId!,
          `I couldn't start on this: ${error instanceof Error ? error.message : 'unknown error'}`,
          rootId ? { rootId } : {},
        )
      }
    },
    /** A Schedule run's outcome, delivered to its creator's Chamber with the schedule's agent. */
    deliverScheduleRun(run: SettledScheduleRun, schedule: Schedule) {
      const room = open(schedule.createdBy.id, schedule.agentDefinitionId)
      reply(room, schedule.agentDefinitionId, answer(run), {
        delivery: {
          kind: 'schedule',
          scheduleId: schedule.id,
          runId: run.id,
          name: schedule.name,
          state: run.state,
        },
      })
    },
  }
}

export type Chambers = ReturnType<typeof createChambers>
