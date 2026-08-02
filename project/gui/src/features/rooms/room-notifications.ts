export type RoomMessageMarker = {
  id: string
  createdAt: number
  authorId: string
}

export type RoomNotification = 'mention' | 'unread'

export function compareMessageMarkers(
  left: RoomMessageMarker,
  right: RoomMessageMarker,
): number {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id)
}

export function roomNotification(
  mentionCount: number,
  latestOtherMessage: RoomMessageMarker | undefined,
  seenMessage: RoomMessageMarker | undefined,
): RoomNotification | undefined {
  if (mentionCount > 0) return 'mention'
  if (
    latestOtherMessage &&
    (!seenMessage || compareMessageMarkers(latestOtherMessage, seenMessage) > 0)
  )
    return 'unread'
  return undefined
}
