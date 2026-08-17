import { expect, test } from 'bun:test'
import { createVmsHttp } from './vms-http'

test('only admins can list, read logs, and nuke machines', async () => {
  const nuked: string[] = []
  const handle = createVmsHttp({
    listMachines: async () => [
      {
        id: 'sandbox-1',
        state: 'running',
        image: 'alpine',
        createdAt: 1,
        mounts: 0,
        network: true,
      },
    ],
    nukeMachine: async (id) => {
      nuked.push(id)
      return true
    },
    machineLogs: async (id) =>
      id === 'sandbox-1'
        ? {
            channels: [
              { name: 'preview', text: 'listening\n' },
              { name: 'init', text: '' },
              { name: 'docker', text: '' },
            ],
          }
        : undefined,
  })
  const request = (method: string, path: string, role: string) => {
    const url = new URL(`http://localhost${path}`)
    return handle(new Request(url, { method }), url, {
      id: role,
      name: role,
      role,
    })
  }

  expect((await request('GET', '/api/vms', 'member'))?.status).toBe(403)
  expect(
    (await request('GET', '/api/vms/sandbox-1/logs', 'member'))?.status,
  ).toBe(403)
  const listed = await request('GET', '/api/vms', 'admin')
  expect(await listed?.json()).toMatchObject({
    machines: [{ id: 'sandbox-1', state: 'running' }],
  })
  const logs = await request('GET', '/api/vms/sandbox-1/logs', 'admin')
  expect(await logs?.json()).toEqual({
    channels: [
      { name: 'preview', text: 'listening\n' },
      { name: 'init', text: '' },
      { name: 'docker', text: '' },
    ],
  })
  expect(
    (await request('GET', '/api/vms/missing/logs', 'admin'))?.status,
  ).toBe(404)
  expect((await request('DELETE', '/api/vms/sandbox-1', 'admin'))?.status).toBe(
    200,
  )
  expect(nuked).toEqual(['sandbox-1'])
})
