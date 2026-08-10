import { expect, test } from 'bun:test'
import { createRunControl } from './run-control'
import type {
  WorkspaceAgentExecutor,
  WorkspaceAgentStartRunRequest,
} from '../../../agents/roster'

function captureExecutor(
  capture: (request: WorkspaceAgentStartRunRequest) => void,
): WorkspaceAgentExecutor {
  return {
    startRun: (request) => {
      capture(request)
      request.onCreate?.({
        id: 'run-1',
        task: request.task,
        definition: {
          id: 'software-engineer',
          instructions: '',
          requestedCapabilities: [],
          runtime: {
            kind: 'cursor',
            image: 'cursor:latest',
            cursor: { apiKey: 'k', model: 'm' },
          },
          executionPolicy: {
            maxDurationMs: 1,
            maxOutputBytes: 1,
            maxSteps: 1,
          },
        },
        state: 'preparing',
        createdAt: 0,
        stdout: '',
        stderr: '',
        inputs: [],
        effectiveLimits: {
          maxDurationMs: 1,
          maxOutputBytes: 1,
          maxSteps: 1,
        },
      })
      return 'run-1'
    },
    getRun: () => undefined,
    listRuns: () => [],
    subscribe: () => () => {},
    subscribeSteps: () => () => {},
    followUp: async () => undefined,
    cancelRun: async () => undefined,
    stop: async () => undefined,
  }
}

test('passes room context and attachment descriptors without assembling inputs', () => {
  let request: WorkspaceAgentStartRunRequest | undefined
  const control = createRunControl(
    captureExecutor((value) => {
      request = value
    }),
  )

  const attachments = [
    {
      type: 'attachment' as const,
      id: 'attachment-1',
      roomId: 'room-1',
      filename: 'brief.txt',
      byteSize: 6,
      sha256: 'a'.repeat(64),
    },
  ]
  control.start('summarize ORI-198', {
    roomId: 'room-1',
    attachments,
    onCreate: () => true,
  })

  expect(request?.task).toBe('summarize ORI-198')
  expect(request?.agentDefinitionId).toBe('software-engineer')
  expect(request?.grantContext).toEqual({
    roomId: 'room-1',
    agentDefinitionId: 'software-engineer',
  })
  expect(request?.attachments).toEqual(attachments)
})

test('passes oneshot context and optional repositoryBase', () => {
  let request: WorkspaceAgentStartRunRequest | undefined
  const control = createRunControl(
    captureExecutor((value) => {
      request = value
    }),
  )

  control.start('create an Issue for the login bug', {
    oneshotId: 'oneshot-1',
    agentDefinitionId: 'antboy',
    repositoryBase: 'feat/login',
    onCreate: () => true,
  })

  expect(request?.grantContext).toEqual({
    oneshotId: 'oneshot-1',
    agentDefinitionId: 'antboy',
    repositoryBase: 'feat/login',
  })
})
