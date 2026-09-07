import { describe, expect, test } from 'bun:test'
import { roomMessageActionsVisible } from './message-action-toolbar'

describe('roomMessageActionsVisible', () => {
  test('stays open on coarse pointers and while a menu is open', () => {
    expect(
      roomMessageActionsVisible({ coarsePointer: false, menuOpen: false }),
    ).toBe(false)
    expect(
      roomMessageActionsVisible({ coarsePointer: true, menuOpen: false }),
    ).toBe(true)
    expect(
      roomMessageActionsVisible({ coarsePointer: false, menuOpen: true }),
    ).toBe(true)
  })
})
