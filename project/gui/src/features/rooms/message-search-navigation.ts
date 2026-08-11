import type { MessageSearchHit } from './types'

export type SearchHitNavigation =
  | { kind: 'message'; roomId: string; messageId: string }
  | { kind: 'thread'; roomId: string; rootId: string; focusReplyId: string }

/**
 * Flat hits open and focus the message directly. Threaded hits (replies)
 * open their root's thread rail focused on the matching reply, rather than
 * injecting the reply into the flat Room timeline.
 */
export function navigationForSearchHit(
  hit: MessageSearchHit,
): SearchHitNavigation {
  return hit.rootId
    ? {
        kind: 'thread',
        roomId: hit.roomId,
        rootId: hit.rootId,
        focusReplyId: hit.messageId,
      }
    : { kind: 'message', roomId: hit.roomId, messageId: hit.messageId }
}
