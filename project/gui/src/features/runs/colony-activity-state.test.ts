import { describe, expect, test } from 'bun:test'
import { runStatus } from './run-helpers'
import {
  completionLabel,
  contextLabel,
  createActivitySession,
  headerPresentation,
  workingLabel,
  activityLocation,
} from './colony-activity-state'
import type { WorkspaceActivityRun } from '#/server/features/runs/workspace-activity'

const run = (
  overrides: Partial<WorkspaceActivityRun> = {},
): WorkspaceActivityRun => ({
  id: 'run-1',
  agentId: 'antboy',
  state: 'running',
  createdAt: 1,
  context: { kind: 'room', roomId: 'general', roomName: 'General' },
  ...overrides,
})

test('workingLabel counts agents unless one agent has multiple runs', () => {
  expect(workingLabel([run()])).toBe('1 agent working')
  expect(
    workingLabel([run(), run({ id: 'run-2', agentId: 'se' })]),
  ).toBe('2 agents working')
  expect(
    workingLabel([run(), run({ id: 'run-2', agentId: 'antboy' })]),
  ).toBe('2 runs active')
})

test('runStatus uses preparing, waitingOn, and real steps', () => {
  expect(runStatus({ state: 'preparing' })).toBe('is preparing')
  expect(
    runStatus({ state: 'preparing', waitingOn: 'Creating sandbox' }),
  ).toBe('is creating sandbox')
  expect(runStatus({ state: 'running' })).toBe('is working')
  expect(
    runStatus(
      { state: 'running' },
      {
        id: 's1',
        runId: 'run-1',
        idx: 0,
        kind: 'tool_call',
        tool: 'shell',
        text: '{"command":"ls"}',
        createdAt: 1,
      },
    ),
  ).toBe('is running `ls`')
})

test('activityLocation opens Room, Issue, and Schedule activity views', () => {
  expect(
    activityLocation(
      run({
        context: { kind: 'room', roomId: 'general', roomName: 'General' },
      }),
    ),
  ).toEqual({ view: 'room', id: 'general', runId: 'run-1' })
  expect(
    activityLocation(
      run({
        id: 'issue-run',
        context: {
          kind: 'issue',
          issueId: 'issue-1',
          issueNumber: 1,
          issueTitle: 'Badge',
        },
      }),
    ),
  ).toEqual({ view: 'issues', id: 'issue-1', runId: 'issue-run' })
  expect(
    activityLocation(
      run({
        id: 'schedule-run',
        context: {
          kind: 'schedule',
          scheduleId: 'sched-1',
          scheduleName: 'Repo check',
        },
      }),
    ),
  ).toEqual({ view: 'schedules', id: 'sched-1', runId: 'schedule-run' })
})

test('contextLabel names Room, Issue, and Schedule', () => {
  expect(
    contextLabel({ kind: 'room', roomId: 'general', roomName: 'General' }),
  ).toBe('Room · General')
  expect(
    contextLabel({
      kind: 'issue',
      issueId: 'i1',
      issueNumber: 12,
      issueTitle: 'Badge',
    }),
  ).toBe('Issue · COL-12')
  expect(
    contextLabel({
      kind: 'schedule',
      scheduleId: 's1',
      scheduleName: 'Repo check',
    }),
  ).toBe('Schedule · Repo check')
})

test('completionLabel distinguishes failures from other terminals', () => {
  expect(completionLabel([run({ state: 'succeeded' })])).toBe('1 completed')
  expect(
    completionLabel([
      run({ state: 'succeeded' }),
      run({ id: 'run-2', state: 'cancelled' }),
    ]),
  ).toBe('2 completed')
  expect(completionLabel([run({ state: 'failed' })])).toBe('1 failed')
  expect(
    completionLabel([
      run({ state: 'succeeded' }),
      run({ id: 'run-2', state: 'failed' }),
    ]),
  ).toBe('1 completed, 1 failed')
})

describe('activity session', () => {
  test('only flashes recent terminals this session saw as active', () => {
    const session = createActivitySession()
    const recent = [run({ id: 'old', state: 'succeeded' })]
    expect(session.trackedRecent(recent)).toEqual([])
    session.noteActive(['run-1'])
    expect(session.trackedRecent([run({ state: 'failed' })])).toEqual([
      run({ state: 'failed' }),
    ])
    session.announce(['run-1'])
    expect(session.trackedRecent([run({ state: 'failed' })])).toEqual([])
  })

  test('refresh with recent but empty session stays idle', () => {
    const session = createActivitySession()
    expect(
      headerPresentation([], [run({ state: 'succeeded' })], session),
    ).toEqual({ kind: 'idle' })
  })

  test('maps working to completion to idle', () => {
    const session = createActivitySession()
    const active = [run()]
    expect(headerPresentation(active, [], session)).toEqual({
      kind: 'working',
      label: '1 agent working',
    })
    session.noteActive(['run-1'])
    const finished = [run({ state: 'succeeded' })]
    expect(headerPresentation([], finished, session)).toEqual({
      kind: 'complete',
      label: '1 completed',
      runs: finished,
    })
    session.announce(['run-1'])
    expect(headerPresentation([], finished, session)).toEqual({ kind: 'idle' })
  })
})
