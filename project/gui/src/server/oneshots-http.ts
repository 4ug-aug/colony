import type { AgentDefinitionSummary } from './coordinator'
import type { RoomUser } from './room-store'
import { json, readBody } from './http/respond'
import {
  OneshotActiveRunError,
  type OneshotRunner,
} from './oneshot-runner'

export function createOneshotsHttp(deps: {
  oneshotRunner: OneshotRunner
  agentDefinitions: () => AgentDefinitionSummary[]
}): (
  request: Request,
  url: URL,
  user: RoomUser,
) => Promise<Response | undefined> {
  const knownAgent = (id: unknown): id is string =>
    typeof id === 'string' &&
    deps.agentDefinitions().some((agent) => agent.id === id)

  return async (request, url, user) => {
    if (url.pathname === '/api/oneshots/active' && request.method === 'GET')
      return json({ run: deps.oneshotRunner.activeForAccount(user.id) ?? null })

    if (url.pathname === '/api/oneshots' && request.method === 'POST') {
      const body = await readBody(request)
      if (!body || typeof body !== 'object')
        return json({ error: 'Invalid Oneshot' }, 400)
      const task =
        typeof (body as { task?: unknown }).task === 'string'
          ? (body as { task: string }).task.trim()
          : ''
      const agentDefinitionId = (body as { agentDefinitionId?: unknown })
        .agentDefinitionId
      const repositoryBaseRaw = (body as { repositoryBase?: unknown })
        .repositoryBase
      const repositoryBase =
        typeof repositoryBaseRaw === 'string' && repositoryBaseRaw.trim()
          ? repositoryBaseRaw.trim()
          : undefined
      if (!task) return json({ error: 'Task is required' }, 400)
      if (!knownAgent(agentDefinitionId))
        return json({ error: 'Unknown agent definition' }, 400)
      const agent = deps
        .agentDefinitions()
        .find((definition) => definition.id === agentDefinitionId)
      if (repositoryBase && agent?.includeRepository === false)
        return json(
          { error: 'Revision is only valid for repository agents' },
          400,
        )
      try {
        const run = deps.oneshotRunner.start({
          accountId: user.id,
          task,
          agentDefinitionId,
          ...(repositoryBase ? { repositoryBase } : {}),
        })
        return json({ run }, 202)
      } catch (error) {
        if (error instanceof OneshotActiveRunError)
          return json({ error: error.message }, 409)
        return json(
          {
            error:
              error instanceof Error
                ? error.message
                : 'Unable to start Oneshot',
          },
          500,
        )
      }
    }

    const runMatch = url.pathname.match(/^\/api\/oneshots\/([^/]+)$/)
    if (runMatch) {
      const runId = decodeURIComponent(runMatch[1]!)
      if (request.method === 'GET') {
        const run = deps.oneshotRunner.get(runId, user.id)
        if (!run) return json({ error: 'Oneshot not found' }, 404)
        const steps = deps.oneshotRunner.listSteps(runId, user.id) ?? []
        return json({ run, steps })
      }
      if (request.method === 'DELETE') {
        const discarded = await deps.oneshotRunner.discard(runId, user.id)
        if (!discarded) return json({ error: 'Oneshot not found' }, 404)
        return json({ ok: true })
      }
    }

    const cancelMatch = url.pathname.match(
      /^\/api\/oneshots\/([^/]+)\/cancel$/,
    )
    if (cancelMatch && request.method === 'POST') {
      const runId = decodeURIComponent(cancelMatch[1]!)
      const run = await deps.oneshotRunner.cancel(runId, user.id)
      if (!run) return json({ error: 'Oneshot not found' }, 404)
      return json({ run })
    }

    return undefined
  }
}
