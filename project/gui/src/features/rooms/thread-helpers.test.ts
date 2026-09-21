import { describe, expect, test } from 'bun:test'
import {
  buildFlatTimelineItems,
  runsForThread,
} from './thread-helpers'
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

describe('thread replies', () => {
  test('are identified by rootId', () => {
    expect(root.rootId).toBeUndefined()
    expect(reply('reply-1', 'user-2', 2).rootId).toBe('root-1')
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

describe('buildFlatTimelineItems', () => {
  test('keeps the Run capsule on the trigger and never inserts a succeeded result into the flat Room', () => {
    const trigger: RoomMessage = {
      ...root,
      id: 'trigger-1',
      text: '@software-engineer hey!',
      createdAt: 100,
      replySummary: {
        replyCount: 1,
        participants: [
          { id: 'software-engineer', name: 'software-engineer' },
        ],
        latestReplyAt: 200,
      },
    }
    const succeeded: RoomRun = {
      ...run('run-1', 'trigger-1'),
      state: 'succeeded',
      createdAt: 100,
      completedAt: 200,
      stdout: 'Hey! How can I help?',
      output: 'Hey! How can I help?',
    }
    const failed: RoomRun = {
      ...run('run-2', 'other-1'),
      state: 'failed',
      completedAt: 150,
      error: 'boom',
    }
    const other: RoomMessage = {
      ...root,
      id: 'other-1',
      text: 'side note',
      createdAt: 120,
    }

    const items = buildFlatTimelineItems([trigger, other], [succeeded, failed])

    expect(items.map((item) => item.id)).toEqual(['trigger-1', 'other-1'])
    expect(items[0]?.runs).toEqual([succeeded])
    expect(items[1]?.runs).toEqual([failed])
    expect(items.every((item) => !('result' in item))).toBe(true)
  })

  test('keeps separate runs that share a trigger instead of collapsing them', () => {
    const trigger: RoomMessage = {
      ...root,
      id: 'trigger-1',
      createdAt: 100,
    }
    const first = run('run-1', 'trigger-1')
    const second = { ...run('run-2', 'trigger-1'), state: 'failed' as const }
    const items = buildFlatTimelineItems([trigger], [first, second])
    expect(items[0]?.runs).toEqual([first, second])
  })

  test('groups only consecutive messages from the same author within five minutes', () => {
    const message = (
      id: string,
      authorId: string,
      createdAt: number,
    ): RoomMessage => ({
      ...root,
      id,
      author: { id: authorId, name: authorId },
      createdAt,
    })

    const withinWindow = buildFlatTimelineItems(
      [message('a', 'admin', 1_000), message('b', 'admin', 300_999)],
      [],
    )
    expect(withinWindow.map((item) => item.grouped)).toEqual([false, true])

    const atFiveMinutes = buildFlatTimelineItems(
      [message('a', 'admin', 1_000), message('b', 'admin', 301_000)],
      [],
    )
    expect(atFiveMinutes.map((item) => item.grouped)).toEqual([false, false])

    const differentAuthor = buildFlatTimelineItems(
      [message('a', 'admin', 1_000), message('b', 'teammate', 2_000)],
      [],
    )
    expect(differentAuthor.map((item) => item.grouped)).toEqual([false, false])
  })
})
