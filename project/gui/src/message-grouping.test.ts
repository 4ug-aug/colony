import { describe, expect, test } from 'bun:test'
import { messagesAreGrouped } from './message-grouping'

describe('message grouping', () => {
  test('groups only consecutive messages from the same author within five minutes', () => {
    const previous = { authorId: 'admin', createdAt: 1_000 }

    expect(
      messagesAreGrouped(previous, {
        authorId: 'admin',
        createdAt: 300_999,
      }),
    ).toBe(true)
    expect(
      messagesAreGrouped(previous, {
        authorId: 'admin',
        createdAt: 301_000,
      }),
    ).toBe(false)
    expect(
      messagesAreGrouped(previous, {
        authorId: 'teammate',
        createdAt: 2_000,
      }),
    ).toBe(false)
  })
})
