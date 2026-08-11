import { describe, expect, test } from 'bun:test'
import {
  acknowledgeNewReplies,
  applyIncomingReplies,
  applyScrollMetrics,
  initialThreadScrollState,
  isNearBottom,
} from './thread-scroll'

describe('isNearBottom', () => {
  test('is true within the threshold', () => {
    expect(
      isNearBottom({ scrollTop: 900, scrollHeight: 1000, clientHeight: 90 }),
    ).toBe(true)
  })

  test('is false beyond the threshold', () => {
    expect(
      isNearBottom({ scrollTop: 400, scrollHeight: 1000, clientHeight: 90 }),
    ).toBe(false)
  })
})

describe('applyIncomingReplies', () => {
  test('near the bottom, incoming replies stay auto-scrolled with no banner', () => {
    const next = applyIncomingReplies(initialThreadScrollState, 1)
    expect(next).toEqual({ atBottom: true, newReplyCount: 0 })
  })

  test('away from the bottom, incoming replies accumulate behind New replies', () => {
    const scrolledUp = { atBottom: false, newReplyCount: 0 }
    const next = applyIncomingReplies(scrolledUp, 2)
    expect(next).toEqual({ atBottom: false, newReplyCount: 2 })
  })

  test('accumulates across multiple incoming batches while scrolled up', () => {
    const scrolledUp = { atBottom: false, newReplyCount: 2 }
    const next = applyIncomingReplies(scrolledUp, 1)
    expect(next).toEqual({ atBottom: false, newReplyCount: 3 })
  })

  test('is a no-op when there are no new replies', () => {
    const scrolledUp = { atBottom: false, newReplyCount: 2 }
    expect(applyIncomingReplies(scrolledUp, 0)).toBe(scrolledUp)
  })
})

describe('applyScrollMetrics', () => {
  test('scrolling back to the bottom clears the New replies count', () => {
    const scrolledUp = { atBottom: false, newReplyCount: 3 }
    const next = applyScrollMetrics(scrolledUp, {
      scrollTop: 950,
      scrollHeight: 1000,
      clientHeight: 90,
    })
    expect(next).toEqual({ atBottom: true, newReplyCount: 0 })
  })

  test('scrolling away from the bottom preserves the pending count', () => {
    const atBottom = { atBottom: true, newReplyCount: 0 }
    const next = applyScrollMetrics(atBottom, {
      scrollTop: 100,
      scrollHeight: 1000,
      clientHeight: 90,
    })
    expect(next).toEqual({ atBottom: false, newReplyCount: 0 })
  })
})

describe('acknowledgeNewReplies', () => {
  test('jumping to the bottom resets the scroll state', () => {
    const scrolledUp = { atBottom: false, newReplyCount: 5 }
    expect(acknowledgeNewReplies(scrolledUp)).toEqual({
      atBottom: true,
      newReplyCount: 0,
    })
  })
})
