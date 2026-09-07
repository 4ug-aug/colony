import { migratedDatabase, seedAccounts } from '#/server/test-db'
import { expect, test } from 'bun:test'
import { createSqliteChatStore } from '#/server/features/chats/chat-store'
import { createSqliteIssueStore } from '#/server/features/issues/issue-store'
import {
  createSqliteRoomStore,
  GENERAL_ROOM_ID,
  type RoomRun,
  type RoomUser,
} from '#/server/features/rooms/room-store'
import { createSqliteScheduleStore } from '#/server/features/schedules/schedule-store'
import {
  createActiveRunsHttp,
  RECENT_TERMINAL_WINDOW_MS,
} from './active-runs-http'

const ada: RoomUser = { id: 'ada', name: 'Ada' }
const bob: RoomUser = { id: 'bob', name: 'Bob' }

const roomRun = (overrides: Partial<RoomRun> = {}): RoomRun => ({
  id: 'room-run-1',
  roomId: GENERAL_ROOM_ID,
  triggerMessageId: 'msg-general',
  requestedBy: ada,
  task: 'Help',
  agentId: 'software-engineer',
  provider: 'openai',
  model: 'gpt-4.1-mini',
  state: 'running',
  createdAt: 10,
  stdout: '',
  stderr: '',
  ...overrides,
})

function harness(now = 1_000_000) {
  const sqlite = migratedDatabase()
  seedAccounts(sqlite, ['ada', 'bob'])
  const roomStore = createSqliteRoomStore(sqlite)
  const issueStore = createSqliteIssueStore(sqlite)
  const scheduleStore = createSqliteScheduleStore(sqlite)
  const chatStore = createSqliteChatStore(sqlite)
  const live = new Map<string, { waitingOn?: string }>()
  const handle = createActiveRunsHttp({
    roomStore,
    issueStore,
    scheduleStore,
    liveRun: (id) => {
      const facts = live.get(id)
      return facts
        ? ({
            id,
            task: '',
            state: 'running',
            createdAt: 0,
            stdout: '',
            stderr: '',
            agentId: 'software-engineer',
            provider: 'openai',
            model: '',
            ...facts,
          } as const)
        : undefined
    },
    now: () => now,
  })

  const postMessage = (id: string, roomId: string) => {
    roomStore.createMessage({
      id,
      roomId,
      author: { kind: 'user', id: ada.id, name: ada.name },
      text: 'Go',
      createdAt: 1,
    })
  }

  postMessage('msg-general', GENERAL_ROOM_ID)

  const call = async (user: RoomUser) => {
    const url = new URL('http://localhost/api/runs/active')
    const response = await handle(
      new Request(url, { method: 'GET' }),
      url,
      user,
    )
    if (!response) throw new Error('unrouted')
    return {
      status: response.status,
      body: (await response.json()) as {
        runs: Array<Record<string, unknown>>
        recent: Array<Record<string, unknown>>
      },
    }
  }

  return {
    sqlite,
    roomStore,
    issueStore,
    scheduleStore,
    chatStore,
    live,
    postMessage,
    call,
    now,
  }
}

test('GET /api/runs/active unions authorized Room, Issue, and Schedule runs', async () => {
  const ctx = harness()
  ctx.roomStore.createRun(roomRun())

  const issue = ctx.issueStore.createIssue({
    id: 'issue-1',
    title: 'Dock badge',
    createdBy: { kind: 'account', id: 'ada' },
    createdAt: 1,
  })
  ctx.issueStore.createRun({
    id: 'issue-run-1',
    issueId: issue.id,
    task: 'Ship it',
    agentId: 'antboy',
    provider: 'openai',
    model: 'm',
    state: 'preparing',
    createdAt: 20,
    stdout: '',
    stderr: '',
  })

  ctx.scheduleStore.createSchedule({
    id: 'schedule-1',
    name: 'Repo check',
    agentDefinitionId: 'software-engineer',
    task: 'Check the repo',
    cronExpression: '* * * * *',
    timezone: 'Europe/Copenhagen',
    state: 'active',
    createdBy: 'ada',
    createdAt: 1,
    nextRunAt: 1,
  })
  ctx.scheduleStore.createRun(
    {
      id: 'schedule-run-1',
      scheduleId: 'schedule-1',
      source: 'manual',
      task: 'Check the repo',
      agentId: 'software-engineer',
      provider: 'openai',
      model: 'm',
      state: 'running',
      createdAt: 30,
      stdout: '',
      stderr: '',
    },
    30,
  )

  const listed = await ctx.call(ada)
  expect(listed.status).toBe(200)
  expect(listed.body.runs.map((run) => run.id).sort()).toEqual([
    'issue-run-1',
    'room-run-1',
    'schedule-run-1',
  ])
  expect(listed.body.runs.find((run) => run.id === 'room-run-1')).toMatchObject({
    agentId: 'software-engineer',
    state: 'running',
    context: { kind: 'room', roomId: GENERAL_ROOM_ID, roomName: 'General' },
  })
  expect(listed.body.runs.find((run) => run.id === 'issue-run-1')).toMatchObject({
    state: 'preparing',
    context: {
      kind: 'issue',
      issueId: issue.id,
      issueNumber: 1,
      issueTitle: 'Dock badge',
    },
  })
  expect(
    listed.body.runs.find((run) => run.id === 'schedule-run-1'),
  ).toMatchObject({
    context: {
      kind: 'schedule',
      scheduleId: 'schedule-1',
      scheduleName: 'Repo check',
    },
  })
  ctx.sqlite.close()
})

test('private Room runs are visible only to members', async () => {
  const ctx = harness()
  ctx.roomStore.createRoom({
    id: 'secret',
    name: 'Secret',
    visibility: 'private',
    createdBy: 'ada',
  })
  ctx.postMessage('msg-secret', 'secret')
  ctx.roomStore.createRun(
    roomRun({
      id: 'private-run',
      roomId: 'secret',
      triggerMessageId: 'msg-secret',
    }),
  )
  ctx.roomStore.createRun(roomRun({ id: 'public-run' }))

  const asAda = await ctx.call(ada)
  expect(asAda.body.runs.map((run) => run.id).sort()).toEqual([
    'private-run',
    'public-run',
  ])

  const asBob = await ctx.call(bob)
  expect(asBob.body.runs.map((run) => run.id)).toEqual(['public-run'])
  ctx.sqlite.close()
})

test('Chat and Oneshot runs never appear on the workspace activity surface', async () => {
  const ctx = harness()
  ctx.roomStore.createOneshotUsage({
    id: 'oneshot-run-1',
    accountId: 'ada',
    state: 'running',
    createdAt: 1,
  })
  ctx.chatStore.create({
    id: 'chat-1',
    accountId: 'ada',
    agentDefinitionId: 'antboy',
    createdAt: 1,
  })
  ctx.chatStore.appendMessage({
    id: 'chat-msg-1',
    chatId: 'chat-1',
    role: 'user',
    text: 'hello',
    createdAt: 2,
    runId: 'chat-run-1',
  })
  ctx.roomStore.createRun(roomRun())

  const listed = await ctx.call(ada)
  expect(listed.body.runs.map((run) => run.id)).toEqual(['room-run-1'])
  expect(listed.body.runs.some((run) => run.id === 'oneshot-run-1')).toBe(false)
  expect(listed.body.runs.some((run) => run.id === 'chat-run-1')).toBe(false)
  ctx.sqlite.close()
})

test('overlays live waitingOn and latest real step', async () => {
  const ctx = harness()
  ctx.roomStore.createRun(roomRun({ state: 'preparing' }))
  ctx.live.set('room-run-1', { waitingOn: 'Creating sandbox' })
  ctx.roomStore.appendStep({
    id: 'step-1',
    runId: 'room-run-1',
    roomId: GENERAL_ROOM_ID,
    idx: 0,
    kind: 'message',
    text: 'Looking around',
    createdAt: 11,
    at: 11,
  })
  ctx.roomStore.appendStep({
    id: 'step-2',
    runId: 'room-run-1',
    roomId: GENERAL_ROOM_ID,
    idx: 1,
    kind: 'tool_call',
    tool: 'shell',
    text: '{"command":"ls"}',
    createdAt: 12,
    at: 12,
  })

  const listed = await ctx.call(ada)
  expect(listed.body.runs[0]).toMatchObject({
    id: 'room-run-1',
    waitingOn: 'Creating sandbox',
    latestStep: {
      id: 'step-2',
      kind: 'tool_call',
      tool: 'shell',
    },
  })
  ctx.sqlite.close()
})

test('preparing to running stays in runs; terminal moves to recent', async () => {
  const ctx = harness()
  ctx.roomStore.createRun(roomRun({ state: 'preparing' }))
  const preparing = await ctx.call(ada)
  expect(preparing.body.runs).toHaveLength(1)
  expect(preparing.body.recent).toEqual([])

  ctx.roomStore.updateRun(roomRun({ state: 'running' }))
  const running = await ctx.call(ada)
  expect(running.body.runs[0]).toMatchObject({ id: 'room-run-1', state: 'running' })
  expect(running.body.recent).toEqual([])

  ctx.roomStore.updateRun(
    roomRun({
      state: 'succeeded',
      completedAt: ctx.now - 1_000,
    }),
  )
  const done = await ctx.call(ada)
  expect(done.body.runs).toEqual([])
  expect(done.body.recent).toMatchObject([
    { id: 'room-run-1', state: 'succeeded' },
  ])

  ctx.roomStore.updateRun(
    roomRun({
      state: 'failed',
      completedAt: ctx.now - RECENT_TERMINAL_WINDOW_MS - 1,
      error: 'boom',
    }),
  )
  const stale = await ctx.call(ada)
  expect(stale.body.runs).toEqual([])
  expect(stale.body.recent).toEqual([])
  ctx.sqlite.close()
})
