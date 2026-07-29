import { expect, test } from 'bun:test'
import { createRunControl } from './run-control'
import type { RunExecutor, StartRunRequest } from '../../../runs'

function captureExecutor(
  capture: (request: StartRunRequest) => void,
): RunExecutor {
  return {
    startRun: (request) => {
      capture(request)
      request.onCreate?.({
        id: 'run-1',
        task: request.task,
        definition: { id: 'software-engineer' },
        state: 'preparing',
        createdAt: 0,
        stdout: '',
        stderr: '',
      } as Parameters<NonNullable<StartRunRequest['onCreate']>>[0])
      return 'run-1'
    },
    getRun: () => undefined,
    listRuns: () => [],
    subscribe: () => () => {},
    subscribeSteps: () => () => {},
    cancelRun: async () => undefined,
  }
}

test('grants every configured capability tool, not just workspace tools', () => {
  let request: StartRunRequest | undefined
  const control = createRunControl(
    captureExecutor((value) => {
      request = value
    }),
    { capability: { tools: ['workspace.post_message', 'linear.get_issue'] } },
  )

  control.start('summarize ORI-198', { roomId: 'room-1', onCreate: () => true })

  expect(request?.capabilityGrant?.tools).toEqual([
    'workspace.post_message',
    'linear.get_issue',
  ])
  expect(request?.grantContext).toEqual({ roomId: 'room-1' })
})

test('omits the capability grant when no tools are configured', () => {
  let request: StartRunRequest | undefined
  const control = createRunControl(
    captureExecutor((value) => {
      request = value
    }),
    { capability: { tools: [] } },
  )

  control.start('summarize the room', { roomId: 'room-1', onCreate: () => true })

  expect(request?.capabilityGrant).toBeUndefined()
})
