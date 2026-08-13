import { expect, test } from 'bun:test'
import { hasAnyRoomNotification, roomNotification } from './room-notifications'
import type { RoomMessageMarker } from './types'

const message = (id: string, createdAt: number): RoomMessageMarker => ({
  id,
  createdAt,
  authorId: 'other',
})

test('mentions take precedence over unread messages', () => {
  expect(roomNotification(1, 1, message('new', 2), message('old', 1))).toBe(
    'mention',
  )
})

test('unread messages are detected after the seen marker', () => {
  expect(roomNotification(0, 0, message('new', 2), message('old', 1))).toBe(
    'unread',
  )
  expect(roomNotification(0, 0, message('old', 1), message('old', 1))).toBe(
    undefined,
  )
})

test('non-mention attention (e.g. Thread Attention) surfaces the sidebar badge even without a flat unread message', () => {
  expect(roomNotification(0, 1, undefined, undefined)).toBe('unread')
  expect(roomNotification(0, 1, message('old', 1), message('old', 1))).toBe(
    'unread',
  )
  expect(roomNotification(0, 0, undefined, undefined)).toBeUndefined()
})

test('hasAnyRoomNotification is true when any room has a notification', () => {
  expect(hasAnyRoomNotification({})).toBe(false)
  expect(hasAnyRoomNotification({ a: undefined })).toBe(false)
  expect(hasAnyRoomNotification({ a: 'unread' })).toBe(true)
  expect(hasAnyRoomNotification({ a: 'mention', b: 'unread' })).toBe(true)
})
