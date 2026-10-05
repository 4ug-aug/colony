import { isTerminalRunState, type TerminalRunState } from '#project/runs'
import type { Consultation } from '#project/mcp/workspace-consultations'
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
  /** The messages each live run answers, so settling can resolve Consultations. */
  const answering = new Map<string, string[]>()
  /** Consultations waiting for an answer, by the message that asked. */
  const waiting = new Map<
    string,
    { askingRunId: string; roomId: string; resolve: (answer: string) => void }
  >()
  /** The agents whose Consultations a run is answering, up the chain. */
  const waitingAgents = (runId: string): string[] => {
    const askers = (answering.get(runId) ?? []).flatMap((id) => {
      const consultation = waiting.get(id)
      return consultation ? [consultation.askingRunId] : []
    })
    return askers.flatMap((asker) => [
      ...(deps.store.getRun(asker) ? [deps.store.getRun(asker)!.agentId] : []),
      ...waitingAgents(asker),
    ])
  }
  const ownerOf = (room: RoomSummary): RoomUser =>
    deps.store.listMembers(room.id).find(({ id }) => id === room.createdBy)!
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
          answering.set(run.id, [...sent])
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
      // An asker that ends no longer needs the Consultations it waits on.
      for (const [questionId, consultation] of waiting) {
        if (consultation.askingRunId !== run.id) continue
        waiting.delete(questionId)
        const answeringRun = [...answering].find(([, ids]) =>
          ids.includes(questionId),
        )?.[0]
        if (answeringRun) void deps.control.cancel(answeringRun)
        else
          deps.messages.cancelQueued(
            consultation.roomId,
            questionId,
            run.agentId,
          )
      }
      const rootId = conversationOf(run)
      const asked = (answering.get(run.id) ?? [run.triggerMessageId]).flatMap(
        (id) => deps.store.getMessage(room.id, id) ?? [],
      )
      answering.delete(run.id)
      const consultation = asked.find(
        ({ delivery }) => delivery?.kind === 'consultation',
      )?.delivery
      reply(room, run.agentId, answer(run), {
        ...(rootId ? { rootId } : {}),
        ...(consultation ? { delivery: consultation } : {}),
      })
      for (const { id } of asked) {
        waiting
          .get(id)
          ?.resolve(
            run.state === 'cancelled'
              ? `${deps.agent(run.agentId).name} was stopped by the user.`
              : answer(run),
          )
        waiting.delete(id)
      }
      const queued = deps.store.listQueuedMessages(room.id, rootId)
      if (!queued.length || busy(room.id, rootId)) return
      const sent = deps.messages.sendQueued(
        room.id,
        queued.map(({ id }) => id),
      )
      // A Chamber's runs are its account's, whoever queued the message.
      try {
        start(room, sent, ownerOf(room))
      } catch (error) {
        reply(
          room,
          room.agentDefinitionId!,
          `I couldn't start on this: ${error instanceof Error ? error.message : 'unknown error'}`,
          rootId ? { rootId } : {},
        )
      }
    },
    /**
     * A Consultation (ADR 0032): the question goes to the asking run's account's
     * Chamber with the agent being asked; resolves with that run's answer.
     */
    async ask(consultation: Consultation): Promise<string> {
      const asking = deps.store.getRun(consultation.askingRunId)
      const home = asking && deps.store.getRoom(asking.roomId)
      if (home?.kind !== 'chamber' || !home.createdBy)
        throw new Error('Agents can only be consulted from a Chamber')
      if (
        waitingAgents(consultation.askingRunId).includes(
          consultation.agentDefinitionId,
        )
      )
        throw new Error(
          `${deps.agent(consultation.agentDefinitionId).name} is waiting on ${deps.agent(consultation.askingAgentId).name}; answer it instead of asking it back.`,
        )
      const room = open(home.createdBy, consultation.agentDefinitionId)
      const queued = busy(room.id, undefined)
      const question = deps.messages.postMessage({
        roomId: room.id,
        author: { kind: 'agent', ...deps.agent(consultation.askingAgentId) },
        text: consultation.question,
        delivery: {
          kind: 'consultation',
          askingAgentId: consultation.askingAgentId,
        },
        ...(queued ? { queued: true } : {}),
      })
      return new Promise((resolve) => {
        waiting.set(question.id, {
          askingRunId: consultation.askingRunId,
          roomId: room.id,
          resolve,
        })
        if (!queued) start(room, [question], ownerOf(room))
      })
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
