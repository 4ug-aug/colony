import type { SmolvmMachineControl } from '../../../../../providers/smolvm-sandbox'
import type { RoomUser } from '../rooms/room-store'
import { json } from '../../http/respond'

export function createVmsHttp(control: SmolvmMachineControl) {
  return async (request: Request, url: URL, user: RoomUser) => {
    if (url.pathname !== '/api/vms' && !url.pathname.startsWith('/api/vms/'))
      return undefined
    if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403)

    if (url.pathname === '/api/vms' && request.method === 'GET')
      return json({ machines: await control.listMachines() })

    const match = url.pathname.match(/^\/api\/vms\/([^/]+)$/)
    if (match && request.method === 'DELETE') {
      let id: string
      try {
        id = decodeURIComponent(match[1])
      } catch {
        return json({ error: 'Invalid machine id' }, 400)
      }
      try {
        return (await control.nukeMachine(id))
          ? json({ id })
          : json({ error: 'Machine not found' }, 404)
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : 'Could not nuke machine',
          },
          502,
        )
      }
    }

    return undefined
  }
}
