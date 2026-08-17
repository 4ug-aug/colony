import { expect, test } from 'bun:test'
import { createVmsHttp } from './vms-http'

test('only admins can list and nuke machines', async () => {
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
  const listed = await request('GET', '/api/vms', 'admin')
  expect(await listed?.json()).toMatchObject({
    machines: [{ id: 'sandbox-1', state: 'running' }],
  })
  expect((await request('DELETE', '/api/vms/sandbox-1', 'admin'))?.status).toBe(
    200,
  )
  expect(nuked).toEqual(['sandbox-1'])
})
