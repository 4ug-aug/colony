import type { RoomMessage, RoomRun } from './types'

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

export type FlatTimelineItem = {
  id: string
  message: RoomMessage
  createdAt: number
  runs: RoomRun[]
  grouped: boolean
}

/** Groups runs by the message that triggered them, preserving input order. */
export function groupRunsByTrigger(
  runs: readonly RoomRun[],
): Map<string, RoomRun[]> {
  const grouped = new Map<string, RoomRun[]>()
  for (const run of runs) {
    const list = grouped.get(run.triggerMessageId)
    if (list) list.push(run)
    else grouped.set(run.triggerMessageId, [run])
  }
  return grouped
}

/**
 * Flat Room timeline: top-level messages with Run capsules under their
 * triggers. Successful finals belong in the root thread, never here.
 */
export function buildFlatTimelineItems(
  messages: readonly RoomMessage[],
  runs: readonly RoomRun[],
): FlatTimelineItem[] {
  const statuses = groupRunsByTrigger(runs)
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
      runs: statuses.get(item.message.id) ?? [],
      grouped:
        previous != null &&
        previous.message.author.id === item.message.author.id &&
        item.createdAt - previous.createdAt < 5 * 60 * 1000,
    }
  })
}
