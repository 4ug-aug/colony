import { describe, expect, test } from 'bun:test'
import {
  applyLiveReply,
  buildFlatTimelineItems,
  runResultAsLiveReply,
  runResultsForThread,
  runsForThread,
  threadRootIdForTrigger,
  withLiveThreadSummaries,
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

describe('applyLiveReply', () => {
  test('bumps reply count, participants, and latest-reply time exactly once per reply id', () => {
    const applied = new Set<string>()
    const first = applyLiveReply(root, reply('reply-1', 'user-2', 2), applied)
    expect(first.applied).toBe(true)
    expect(first.message.replySummary).toEqual({
      replyCount: 1,
      participants: [{ id: 'user-2', name: 'user-2' }],
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
      participants: [
        { id: 'user-1', name: 'user-1' },
        { id: 'user-2', name: 'user-2' },
      ],
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

describe('withLiveThreadSummaries', () => {
  test('folds live replies and run results onto the server baseline summary', () => {
    const rooted: RoomMessage = {
      ...root,
      replySummary: {
        replyCount: 1,
        participants: [{ id: 'user-2', name: 'user-2' }],
        latestReplyAt: 2,
      },
    }
    const liveReply = reply('reply-2', 'user-1', 3)
    const liveResult = runResultAsLiveReply(
      {
        id: 'run-1',
        roomId: 'general',
        agentId: 'antboy',
        createdAt: 4,
        completedAt: 4,
      },
      'root-1',
    )
    const [updated] = withLiveThreadSummaries(
      [rooted],
      { 'root-1': [liveReply] },
      { 'root-1': [liveResult] },
    )
    expect(updated?.replySummary).toEqual({
      replyCount: 3,
      participants: [
        { id: 'antboy', name: 'antboy' },
        { id: 'user-1', name: 'user-1' },
        { id: 'user-2', name: 'user-2' },
      ],
      latestReplyAt: 4,
    })
  })

  test('leaves messages without live activity unchanged', () => {
    const rooted: RoomMessage = {
      ...root,
      replySummary: {
        replyCount: 2,
        participants: [{ id: 'user-2', name: 'user-2' }],
        latestReplyAt: 2,
      },
    }
    expect(withLiveThreadSummaries([rooted], {})).toEqual([rooted])
  })
})

describe('threadRootIdForTrigger', () => {
  test('resolves a top-level trigger to itself and a reply trigger to its root', () => {
    expect(threadRootIdForTrigger('root-1', [root], {})).toBe('root-1')
    expect(
      threadRootIdForTrigger('reply-1', [root], {
        'root-1': [reply('reply-1', 'user-2', 2)],
      }),
    ).toBe('root-1')
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
    expect(items[0]?.run).toEqual(succeeded)
    expect(items[1]?.run).toEqual(failed)
    expect(items.every((item) => !('result' in item))).toBe(true)
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

describe('runResultsForThread', () => {
  test('maps succeeded thread runs to result replies and skips failures', () => {
    const replies = [reply('reply-1', 'user-2', 2)]
    const succeededRoot: RoomRun = {
      ...run('run-root', 'root-1'),
      state: 'succeeded',
      completedAt: 5,
      stdout: 'Final answer',
      output: 'Final answer',
    }
    const succeededReply: RoomRun = {
      ...run('run-reply', 'reply-1'),
      state: 'succeeded',
      completedAt: 6,
      stdout: 'Also done',
    }
    const warm: RoomRun = {
      ...run('run-warm', 'root-1'),
      state: 'running',
      exitCode: 0,
      stdout: 'Warm answer',
    }
    const failed: RoomRun = {
      ...run('run-fail', 'root-1'),
      state: 'failed',
      completedAt: 7,
      error: 'nope',
      stdout: 'partial',
    }
    const elsewhere: RoomRun = {
      ...run('run-elsewhere', 'other-message'),
      state: 'succeeded',
      completedAt: 8,
      stdout: 'wrong thread',
    }

    expect(
      runResultsForThread(
        [succeededRoot, succeededReply, warm, failed, elsewhere],
        root,
        replies,
      ),
    ).toEqual([
      {
        id: 'run-warm',
        agentId: 'software-engineer',
        text: 'Warm answer',
        createdAt: 1,
      },
      {
        id: 'run-root',
        agentId: 'software-engineer',
        text: 'Final answer',
        createdAt: 5,
      },
      {
        id: 'run-reply',
        agentId: 'software-engineer',
        text: 'Also done',
        createdAt: 6,
      },
    ])
  })
})
