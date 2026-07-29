import { expect, test } from 'bun:test'
import { createRunControl } from './run-control'
import type {
  SoftwareEngineerExecutor,
  SoftwareEngineerStartRunRequest,
} from '../../../agents/software-engineer'

function captureExecutor(
  capture: (request: SoftwareEngineerStartRunRequest) => void,
): SoftwareEngineerExecutor {
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
      } as Parameters<
        NonNullable<SoftwareEngineerStartRunRequest['onCreate']>
      >[0])
      return 'run-1'
    },
    getRun: () => undefined,
    listRuns: () => [],
    subscribe: () => () => {},
    subscribeSteps: () => () => {},
    cancelRun: async () => undefined,
  }
}

test('passes room context without assembling infrastructure concerns', () => {
  let request: SoftwareEngineerStartRunRequest | undefined
  const control = createRunControl(
    captureExecutor((value) => {
      request = value
    }),
  )

  control.start('summarize ORI-198', { roomId: 'room-1', onCreate: () => true })

  expect(request?.task).toBe('summarize ORI-198')
  expect(request?.grantContext).toEqual({ roomId: 'room-1' })
})
