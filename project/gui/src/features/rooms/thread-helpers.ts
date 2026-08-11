import type { RoomMessage, RoomRun } from './types'

export function isThreadReply(message: RoomMessage): boolean {
  return message.rootId != null
}

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
  const participantIds = [
    reply.author.id,
    ...(previous?.participantIds ?? []).filter((id) => id !== reply.author.id),
  ].slice(0, 3)
  return {
    message: {
      ...root,
      replySummary: {
        replyCount: (previous?.replyCount ?? 0) + 1,
        participantIds,
        latestReplyAt: Math.max(previous?.latestReplyAt ?? 0, reply.createdAt),
      },
    },
    applied: true,
  }
}
