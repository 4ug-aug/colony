import type {
  RunControl,
  RunSummary,
} from '#/server/features/runs/run-control'
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

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled'])

/** A run's outcome as the agent's reply in its Chamber conversation. */
export function chamberAnswer(
  run: Pick<RunSummary, 'state' | 'stdout' | 'error'>,
): string {
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
}) {
  const conversationOf = (run: RoomRun) =>
    deps.store.getMessage(run.roomId, run.triggerMessageId)?.rootId
  const busy = (roomId: string, rootId: string | undefined) =>
    // ponytail: scans the Chamber's runs; index active runs if Chambers grow long.
    deps.store
      .listRuns(roomId)
      .some((run) => !TERMINAL.has(run.state) && conversationOf(run) === rootId)

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
    )
      .filter((message) => !sent.has(message.id) && !message.queued)
      // A delivery's text is the bare output; name where it came from.
      .map((message) =>
        message.delivery
          ? {
              ...message,
              text: `Schedule "${message.delivery.name}" ${message.delivery.state}:\n${message.text}`,
            }
          : message,
      )
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
    rootId: string | undefined,
    text: string,
    delivery?: MessageDelivery,
  ) =>
    deps.messages.postMessage({
      roomId: room.id,
      author: { kind: 'agent', ...deps.agent(room.agentDefinitionId!) },
      text,
      ...(rootId ? { rootId } : {}),
      ...(delivery ? { delivery } : {}),
    })

  return {
    /** True when a new message in this conversation must wait for a run. */
    busy,
    start,
    /** Posts as the agent, top-level, in the account's Chamber with it (created if missing). */
    deliver(
      accountId: string,
      agentId: string,
      text: string,
      delivery: MessageDelivery,
    ) {
      const room = deps.store.chamberFor(accountId, deps.agent(agentId))
      reply(room, undefined, text, delivery)
      return room
    },
    /** Posts a settled run's answer, then sends whatever queued behind it. */
    settled(run: RoomRun) {
      const room = deps.store.getRoom(run.roomId)
      if (room?.kind !== 'chamber') return
      const rootId = conversationOf(run)
      deps.messages.postMessage({
        roomId: room.id,
        author: { kind: 'agent', ...deps.agent(run.agentId) },
        text: chamberAnswer(run),
        ...(rootId ? { rootId } : {}),
      })
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
          rootId,
          `I couldn't start on this: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      }
    },
  }
}

export type Chambers = ReturnType<typeof createChambers>
