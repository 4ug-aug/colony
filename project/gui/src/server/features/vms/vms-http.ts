import type { SmolvmMachineControl } from '../../../../../providers/smolvm-sandbox'
import type { RoomUser } from '../rooms/room-store'
import { json, readBody } from '../../http/respond'

function machineId(raw: string | undefined) {
  if (!raw) return undefined
  try {
    return decodeURIComponent(raw)
  } catch {
    return undefined
  }
}

export function createVmsHttp(control: SmolvmMachineControl) {
  return async (request: Request, url: URL, user: RoomUser) => {
    if (url.pathname !== '/api/vms' && !url.pathname.startsWith('/api/vms/'))
      return undefined
    if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403)

    if (url.pathname === '/api/vms' && request.method === 'GET')
      return json({ machines: await control.listMachines() })

    const logsMatch = url.pathname.match(/^\/api\/vms\/([^/]+)\/logs$/)
    if (logsMatch && request.method === 'GET') {
      const id = machineId(logsMatch[1])
      if (!id) return json({ error: 'Invalid machine id' }, 400)
      const logs = await control.machineLogs(id)
      return logs
        ? json(logs)
        : json({ error: 'Machine not found' }, 404)
    }

    const execMatch = url.pathname.match(/^\/api\/vms\/([^/]+)\/exec$/)
    if (execMatch && request.method === 'POST') {
      const id = machineId(execMatch[1])
      if (!id) return json({ error: 'Invalid machine id' }, 400)
      const body = await readBody(request)
      const command =
        typeof body?.command === 'string' ? body.command.trim() : ''
      if (!command) return json({ error: 'Command required' }, 400)
      try {
        const result = await control.execMachine(id, command)
        return result
          ? json(result)
          : json({ error: 'Machine not found' }, 404)
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : 'Could not exec',
          },
          502,
        )
      }
    }

    const match = url.pathname.match(/^\/api\/vms\/([^/]+)$/)
    if (match && request.method === 'DELETE') {
      const id = machineId(match[1])
      if (!id) return json({ error: 'Invalid machine id' }, 400)
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
