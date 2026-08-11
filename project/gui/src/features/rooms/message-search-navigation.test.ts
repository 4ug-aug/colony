import { describe, expect, test } from 'bun:test'
import { navigationForSearchHit } from './message-search-navigation'
import type { MessageSearchHit } from './types'

function hit(overrides: Partial<MessageSearchHit> = {}): MessageSearchHit {
  return {
    messageId: 'msg-1',
    roomId: 'general',
    roomName: 'General',
    author: { id: 'user-1', name: 'Ada' },
    text: 'Hello',
    createdAt: 1,
    ...overrides,
  }
}

describe('navigationForSearchHit', () => {
  test('opens the message directly for a flat hit', () => {
    expect(navigationForSearchHit(hit())).toEqual({
      kind: 'message',
      roomId: 'general',
      messageId: 'msg-1',
    })
  })

  test('opens the root thread focused on the matching reply for a threaded hit', () => {
    expect(navigationForSearchHit(hit({ rootId: 'root-1' }))).toEqual({
      kind: 'thread',
      roomId: 'general',
      rootId: 'root-1',
      focusReplyId: 'msg-1',
    })
  })
})
