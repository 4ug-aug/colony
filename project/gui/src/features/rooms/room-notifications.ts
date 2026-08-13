import type { RoomMessageMarker } from './types'

export type RoomNotification = 'mention' | 'unread'

export function compareMessageMarkers(
  left: RoomMessageMarker,
  right: RoomMessageMarker,
): number {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id)
}

export function roomNotification(
  mentionCount: number,
  /** Total open Attention for the room, aggregating mentions, terminal runs, and Thread Attention. */
  attentionCount: number,
  latestOtherMessage: RoomMessageMarker | undefined,
  seenMessage: RoomMessageMarker | undefined,
): RoomNotification | undefined {
  if (mentionCount > 0) return 'mention'
  if (attentionCount > 0) return 'unread'
  if (
    latestOtherMessage &&
    (!seenMessage || compareMessageMarkers(latestOtherMessage, seenMessage) > 0)
  )
    return 'unread'
  return undefined
}

export function hasAnyRoomNotification(
  notificationByRoom: Partial<Record<string, RoomNotification>>,
): boolean {
  return Object.values(notificationByRoom).some(Boolean)
}
