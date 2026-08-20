import type {
  RoomMessage,
  RoomRun,
  RunResultReply,
} from './types'

/**
 * Filters a room-wide run list down to the runs relevant to one thread — a
 * run triggered by the thread root itself, or by one of its replies — so a
 * Run capsule can be shown beneath whichever message actually triggered it.
 */
export function runsForThread(
  runs: readonly RoomRun[],
  root: RoomMessage | undefined,
  replies: readonly RoomMessage[],
): RoomRun[] {
  if (!root) return []
  const triggerIds = new Set([root.id, ...replies.map((reply) => reply.id)])
  return runs.filter((run) => triggerIds.has(run.triggerMessageId))
}

/** Successful run finals for a thread, presented as chronological result replies. */
export function runResultsForThread(
  runs: readonly RoomRun[],
  root: RoomMessage | undefined,
  replies: readonly RoomMessage[],
): RunResultReply[] {
  return runsForThread(runs, root, replies)
    .filter(
      (run) =>
        run.state === 'succeeded' ||
        (run.state === 'running' &&
          run.exitCode === 0 &&
          Boolean((run.output ?? run.stdout)?.trim())),
    )
    .map((run) => ({
      id: run.id,
      agentId: run.agentId,
      text: (run.output ?? run.stdout) || 'Completed.',
      createdAt: run.completedAt ?? run.createdAt,
    }))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export type FlatTimelineItem = {
  id: string
  message: RoomMessage
  createdAt: number
  runs: RoomRun[]
  grouped: boolean
}

/** Room-linked runs started from this message, oldest first. */
export function runsForTrigger(
  runs: readonly RoomRun[],
  triggerMessageId: string,
): RoomRun[] {
  return runs
    .filter((run) => run.triggerMessageId === triggerMessageId)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

/**
 * Flat Room timeline: top-level messages with Run capsules under their
 * triggers. Successful finals belong in the root thread, never here.
 */
export function buildFlatTimelineItems(
  messages: readonly RoomMessage[],
  runs: readonly RoomRun[],
): FlatTimelineItem[] {
  const sorted = [...messages]
    .map((message) => ({
      id: message.id,
      message,
      createdAt: message.createdAt,
    }))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  return sorted.map((item, index) => {
    const previous = sorted[index - 1]
    return {
      ...item,
      runs: runsForTrigger(runs, item.message.id),
      grouped:
        previous != null &&
        previous.message.author.id === item.message.author.id &&
        item.createdAt - previous.createdAt < 5 * 60 * 1000,
    }
  })
}

/**
 * Applies a live thread reply to its root's derived summary, idempotently.
 * `appliedReplyIds` tracks reply ids already folded into `root.replySummary`
 * so a reply delivered twice (e.g. an optimistic send plus its own
 * broadcast) is only counted once.
 */
export function applyLiveReply(
  root: RoomMessage,
  reply: RoomMessage,
  appliedReplyIds: ReadonlySet<string>,
): { message: RoomMessage; applied: boolean } {
  if (reply.rootId !== root.id || appliedReplyIds.has(reply.id))
    return { message: root, applied: false }
  const previous = root.replySummary
  const participants = [
    { id: reply.author.id, name: reply.author.name },
    ...(previous?.participants ?? []).filter(
      (participant) => participant.id !== reply.author.id,
    ),
  ].slice(0, 3)
  return {
    message: {
      ...root,
      replySummary: {
        replyCount: (previous?.replyCount ?? 0) + 1,
        participants,
        latestReplyAt: Math.max(previous?.latestReplyAt ?? 0, reply.createdAt),
      },
    },
    applied: true,
  }
}

/**
 * Timeline chip summaries must stay live. Server-loaded `message.replySummary`
 * is the baseline; replies / successful run results received since then are
 * folded on top so chips update without waiting for a history refetch, and
 * without being clobbered when a stale page merge overwrites message rows.
 */
export function withLiveThreadSummaries(
  messages: readonly RoomMessage[],
  liveRepliesByRoot: Readonly<Record<string, readonly RoomMessage[]>>,
  liveResultsByRoot: Readonly<Record<string, readonly RoomMessage[]>> = {},
): RoomMessage[] {
  return messages.map((message) => {
    if (message.rootId != null) return message
    const liveReplies = liveRepliesByRoot[message.id] ?? []
    const liveResults = liveResultsByRoot[message.id] ?? []
    if (!liveReplies.length && !liveResults.length) return message
    const applied = new Set<string>()
    let next = message
    for (const reply of [...liveReplies, ...liveResults]) {
      const result = applyLiveReply(next, reply, applied)
      if (!result.applied) continue
      applied.add(reply.id)
      next = result.message
    }
    return next
  })
}

/** Synthetic reply used to count a successful run result toward a root summary. */
export function runResultAsLiveReply(
  run: Pick<
    RoomRun,
    'id' | 'roomId' | 'agentId' | 'completedAt' | 'createdAt'
  >,
  rootId: string,
): RoomMessage {
  return {
    id: run.id,
    roomId: run.roomId,
    author: { kind: 'agent', id: run.agentId, name: run.agentId },
    text: '',
    createdAt: run.completedAt ?? run.createdAt,
    attachments: [],
    rootId,
  }
}

export function threadRootIdForTrigger(
  triggerMessageId: string,
  messages: readonly RoomMessage[],
  liveRepliesByRoot: Readonly<Record<string, readonly RoomMessage[]>>,
): string | undefined {
  const topLevel = messages.find((message) => message.id === triggerMessageId)
  if (topLevel) return topLevel.rootId ?? topLevel.id
  for (const [rootId, replies] of Object.entries(liveRepliesByRoot)) {
    if (replies.some((reply) => reply.id === triggerMessageId)) return rootId
  }
  return undefined
}
