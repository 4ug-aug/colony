import { describe, expect, test } from 'bun:test'
import { applyLiveReply, isThreadReply, runsForThread } from './thread-helpers'
import type { RoomMessage, RoomRun } from './types'

const root: RoomMessage = {
  id: 'root-1',
  roomId: 'general',
  author: { id: 'user-1', name: 'Ada' },
  text: 'Root question',
  createdAt: 1,
  attachments: [],
}

function reply(id: string, authorId: string, createdAt: number): RoomMessage {
  return {
    id,
    roomId: 'general',
    author: { id: authorId, name: authorId },
    text: 'Reply text',
    createdAt,
    attachments: [],
    rootId: 'root-1',
  }
}

describe('isThreadReply', () => {
  test('is true only when rootId is set', () => {
    expect(isThreadReply(root)).toBe(false)
    expect(isThreadReply(reply('reply-1', 'user-2', 2))).toBe(true)
  })
})

describe('applyLiveReply', () => {
  test('bumps reply count, participants, and latest-reply time exactly once per reply id', () => {
    const applied = new Set<string>()
    const first = applyLiveReply(root, reply('reply-1', 'user-2', 2), applied)
    expect(first.applied).toBe(true)
    expect(first.message.replySummary).toEqual({
      replyCount: 1,
      participantIds: ['user-2'],
      latestReplyAt: 2,
    })
    applied.add('reply-1')

    const second = applyLiveReply(
      first.message,
      reply('reply-2', 'user-1', 3),
      applied,
    )
    expect(second.applied).toBe(true)
    expect(second.message.replySummary).toEqual({
      replyCount: 2,
      participantIds: ['user-1', 'user-2'],
      latestReplyAt: 3,
    })
    applied.add('reply-2')

    const repeat = applyLiveReply(
      second.message,
      reply('reply-1', 'user-2', 2),
      applied,
    )
    expect(repeat.applied).toBe(false)
    expect(repeat.message).toBe(second.message)
  })

  test('is a no-op when the reply does not belong to this root', () => {
    const result = applyLiveReply(
      root,
      { ...reply('reply-1', 'user-2', 2), rootId: 'other-root' },
      new Set(),
    )
    expect(result.applied).toBe(false)
    expect(result.message).toBe(root)
  })
})

function run(id: string, triggerMessageId: string): RoomRun {
  return {
    id,
    roomId: 'general',
    triggerMessageId,
    requestedBy: { id: 'user-1', name: 'Ada' },
    agentId: 'software-engineer',
    task: 'do the thing',
    provider: 'cursor',
    model: 'gpt',
    state: 'running',
    createdAt: 1,
    stdout: '',
  }
}

describe('runsForThread', () => {
  test('keeps only runs triggered by the root or one of its replies', () => {
    const replies = [
      reply('reply-1', 'user-2', 2),
      reply('reply-2', 'user-1', 3),
    ]
    const runs = [
      run('run-root', 'root-1'),
      run('run-reply', 'reply-1'),
      run('run-elsewhere', 'other-message'),
    ]
    expect(runsForThread(runs, root, replies)).toEqual([
      run('run-root', 'root-1'),
      run('run-reply', 'reply-1'),
    ])
  })

  test('returns an empty list without a loaded root', () => {
    expect(runsForThread([run('run-root', 'root-1')], undefined, [])).toEqual(
      [],
    )
  })
})
