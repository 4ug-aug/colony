import { describe, expect, test } from 'bun:test'
import {
  finishThreadExit,
  requestThreadSurface,
  sameThreadSurface,
} from './thread-transition'
import type { ThreadTransitionState } from './thread-transition'

const closed: ThreadTransitionState = { phase: 'closed' }
const threadA = { kind: 'thread' as const, rootId: 'root-a' }
const threadB = { kind: 'thread' as const, rootId: 'root-b' }
const activity = { kind: 'activity' as const, runId: 'run-1' }

describe('requestThreadSurface', () => {
  test('opens immediately from closed with no exit phase', () => {
    expect(requestThreadSurface(closed, threadA)).toEqual({
      phase: 'open',
      surface: threadA,
    })
  })

  test('requesting closed while already closed stays closed', () => {
    expect(requestThreadSurface(closed, undefined)).toEqual(closed)
  })

  test('selecting another root exits the current thread before the next enters', () => {
    const open = requestThreadSurface(closed, threadA)
    const next = requestThreadSurface(open, threadB)
    expect(next).toEqual({ phase: 'exiting', surface: threadA, next: threadB })
  })

  test('finishing the exit opens the queued surface', () => {
    const exiting: ThreadTransitionState = {
      phase: 'exiting',
      surface: threadA,
      next: threadB,
    }
    expect(finishThreadExit(exiting)).toEqual({
      phase: 'open',
      surface: threadB,
    })
  })

  test('opening Run Activity replaces the thread in the same surface', () => {
    const open = requestThreadSurface(closed, threadA)
    const exiting = requestThreadSurface(open, activity)
    expect(exiting).toEqual({
      phase: 'exiting',
      surface: threadA,
      next: activity,
    })
    expect(finishThreadExit(exiting)).toEqual({
      phase: 'open',
      surface: activity,
    })
  })

  test('closing an open surface exits before becoming closed', () => {
    const open = requestThreadSurface(closed, threadA)
    const exiting = requestThreadSurface(open, undefined)
    expect(exiting).toEqual({
      phase: 'exiting',
      surface: threadA,
      next: undefined,
    })
    expect(finishThreadExit(exiting)).toEqual({ phase: 'closed' })
  })

  test('re-requesting the same open surface is a no-op', () => {
    const open = requestThreadSurface(closed, threadA)
    expect(requestThreadSurface(open, { ...threadA })).toEqual(open)
  })

  test('re-targeting mid-exit never stacks a second surface', () => {
    const open = requestThreadSurface(closed, threadA)
    const exitingToB = requestThreadSurface(open, threadB)
    const retargeted = requestThreadSurface(exitingToB, activity)
    expect(retargeted).toEqual({
      phase: 'exiting',
      surface: threadA,
      next: activity,
    })
  })

  test('finishThreadExit is a no-op outside the exiting phase', () => {
    const open = requestThreadSurface(closed, threadA)
    expect(finishThreadExit(open)).toBe(open)
    expect(finishThreadExit(closed)).toBe(closed)
  })
})

describe('sameThreadSurface', () => {
  test('thread surfaces match only by root id', () => {
    expect(sameThreadSurface(threadA, { ...threadA })).toBe(true)
    expect(sameThreadSurface(threadA, threadB)).toBe(false)
  })

  test('a thread surface never matches an activity surface', () => {
    expect(sameThreadSurface(threadA, activity)).toBe(false)
  })

  test('undefined only matches undefined', () => {
    expect(sameThreadSurface(undefined, undefined)).toBe(true)
    expect(sameThreadSurface(threadA, undefined)).toBe(false)
  })
})
