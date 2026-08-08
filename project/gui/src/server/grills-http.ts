import { GRILL_TURN_CONTRACT } from '../../../mcp/workspace-grill'
import type { GrillStore, GrillKind, GrillVisibility } from './grill-store'
import type { RoomUser } from './room-store'
import { json, readBody } from './http/respond'

const kinds = new Set<GrillKind>(['code', 'general'])
const visibilities = new Set<GrillVisibility>(['invite-only', 'workspace-open'])

export function createGrillsHttp(deps: {
  grillStore: GrillStore
  broadcastGrillAttention?: (userId: string, grillId: string) => void
  linkedRuns?: {
    start(input: {
      grillId: string
      task: string
      agentDefinitionId: string
    }): unknown
    followUp(grillId: string, task: string): Promise<unknown>
    dispose(grillId: string): Promise<void>
    getLinkedRun?(grillId: string): unknown
    getLatestStep?(grillId: string): unknown
  }
}): (
  request: Request,
  url: URL,
  user: RoomUser,
) => Promise<Response | undefined> {
  return async (request, url, user) => {
    if (url.pathname === '/api/grills' && request.method === 'GET') {
      const grills = deps.grillStore.listGrillsForUser(user.id).map((grill) => {
        const linkedRun = deps.linkedRuns?.getLinkedRun?.(grill.id)
        const latestStep = deps.linkedRuns?.getLatestStep?.(grill.id)
        return {
          ...grill,
          ...(linkedRun !== undefined ? { linkedRun } : {}),
          ...(latestStep !== undefined ? { latestStep } : {}),
        }
      })
      return json({ grills })
    }

    if (url.pathname === '/api/grills' && request.method === 'POST') {
      const body = await readBody(request)
      if (!body) return json({ error: 'Invalid Grill' }, 400)
      const kind = body.kind
      const visibility = body.visibility
      const agentDefinitionId = body.agentDefinitionId
      if (typeof kind !== 'string' || !kinds.has(kind as GrillKind))
        return json({ error: 'Invalid Grill kind' }, 400)
      if (
        typeof visibility !== 'string' ||
        !visibilities.has(visibility as GrillVisibility)
      )
        return json({ error: 'Invalid Grill visibility' }, 400)
      if (typeof agentDefinitionId !== 'string' || !agentDefinitionId)
        return json({ error: 'Invalid agent definition' }, 400)
      const baseRef =
        typeof body.baseRef === 'string' && body.baseRef
          ? body.baseRef
          : undefined
      const initialRequest =
        typeof body.initialRequest === 'string' && body.initialRequest.trim()
          ? body.initialRequest.trim()
          : undefined
      try {
        const grill = deps.grillStore.createGrill({
          id: crypto.randomUUID(),
          kind: kind as GrillKind,
          visibility: visibility as GrillVisibility,
          agentDefinitionId,
          ...(baseRef ? { baseRef } : {}),
          ...(initialRequest ? { initialRequest } : {}),
          createdBy: user.id,
          createdAt: Date.now(),
        })
        return json({ grill }, 201)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create Grill'
        return json({ error: message }, 400)
      }
    }

    const runRoute = url.pathname.match(/^\/api\/grills\/([^/]+)\/run$/)
    if (runRoute && request.method === 'POST') {
      const id = runRoute[1]!
      const grill = deps.grillStore.getGrillForUser(id, user.id)
      if (!grill) return json({ error: 'Grill not found' }, 404)
      if (!deps.linkedRuns) return json({ error: 'Grill runs unavailable' }, 503)
      const body = await readBody(request)
      const task = typeof body?.task === 'string' ? body.task.trim() : ''
      if (!task) return json({ error: 'Invalid task' }, 400)
      const run = deps.linkedRuns.start({
        grillId: id,
        task: `${task}\n\n${GRILL_TURN_CONTRACT}`,
        agentDefinitionId: grill.agentDefinitionId,
      })
      return json({ run }, 201)
    }

    const inviteRoute = url.pathname.match(/^\/api\/grills\/([^/]+)\/invite$/)
    if (inviteRoute && request.method === 'POST') {
      const id = inviteRoute[1]!
      if (!deps.grillStore.getGrillForUser(id, user.id))
        return json({ error: 'Grill not found' }, 404)
      const body = await readBody(request)
      const userId = body?.userId
      if (typeof userId !== 'string' || !userId)
        return json({ error: 'Invalid userId' }, 400)
      const grill = deps.grillStore.getGrill(id)
      if (!grill) return json({ error: 'Grill not found' }, 404)
      if (grill.visibility !== 'invite-only')
        return json({ error: 'Only invite-only Grills accept invites' }, 400)
      deps.grillStore.invite(id, userId, Date.now())
      deps.broadcastGrillAttention?.(userId, id)
      const attentionCount =
        deps.grillStore.listGrillAttentionCounts(userId).get(id) ?? 0
      return json({ grillId: id, attentionCount })
    }

    const ackRoute = url.pathname.match(
      /^\/api\/grills\/([^/]+)\/attention\/acknowledge$/,
    )
    if (ackRoute && request.method === 'POST') {
      const id = ackRoute[1]!
      if (!deps.grillStore.getGrillForUser(id, user.id))
        return json({ error: 'Grill not found' }, 404)
      deps.grillStore.acknowledgeGrillAttention(id, user.id, Date.now())
      deps.broadcastGrillAttention?.(user.id, id)
      const attentionCount =
        deps.grillStore.listGrillAttentionCounts(user.id).get(id) ?? 0
      return json({ grillId: id, attentionCount })
    }

    const submitRoute = url.pathname.match(/^\/api\/grills\/([^/]+)\/submit$/)
    if (submitRoute && request.method === 'POST') {
      const id = submitRoute[1]!
      if (!deps.grillStore.getGrillForUser(id, user.id))
        return json({ error: 'Grill not found' }, 404)
      const body = await readBody(request)
      let drafts: Record<string, string> | undefined
      if (body?.drafts !== undefined) {
        if (typeof body.drafts !== 'object' || body.drafts === null)
          return json({ error: 'Invalid drafts' }, 400)
        drafts = {}
        for (const [key, value] of Object.entries(
          body.drafts as Record<string, unknown>,
        )) {
          if (typeof value !== 'string')
            return json({ error: 'Invalid drafts' }, 400)
          drafts[key] = value
        }
      }
      try {
        const grill = deps.grillStore.submitRound(id, Date.now(), drafts)
        if (!grill) return json({ error: 'Grill not found' }, 404)
        const latest = grill.settledAnswers.at(-1)
        if (latest && deps.linkedRuns) {
          const qa = latest.questions
            .map((question) => {
              const answer = latest.answers[question.id] ?? ''
              return `Q: ${question.prompt}\nA: ${answer}`
            })
            .join('\n\n')
          const task = [
            'Accounts submitted this Grill round. Treat these as settled answers.',
            GRILL_TURN_CONTRACT,
            '',
            qa,
          ].join('\n')
          // Don't block the HTTP response on the agent turn — that made Submit
          // feel hung and invited double-submits against an empty frontier.
          void deps.linkedRuns.followUp(id, task).catch((error) => {
            console.error('Grill follow-up after submit failed', error)
          })
        }
        return json({ grill })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to submit round'
        return json({ error: message }, 400)
      }
    }

    const draftsRoute = url.pathname.match(/^\/api\/grills\/([^/]+)\/drafts$/)
    if (draftsRoute && request.method === 'PATCH') {
      const id = draftsRoute[1]!
      if (!deps.grillStore.getGrillForUser(id, user.id))
        return json({ error: 'Grill not found' }, 404)
      const body = await readBody(request)
      if (!body || typeof body.drafts !== 'object' || body.drafts === null)
        return json({ error: 'Invalid drafts' }, 400)
      const drafts: Record<string, string> = {}
      for (const [key, value] of Object.entries(
        body.drafts as Record<string, unknown>,
      )) {
        if (typeof value !== 'string')
          return json({ error: 'Invalid drafts' }, 400)
        drafts[key] = value
      }
      const grill = deps.grillStore.updateDrafts(id, drafts, Date.now())
      if (!grill) return json({ error: 'Grill not found' }, 404)
      return json({ grill })
    }

    const pushBackRoute = url.pathname.match(
      /^\/api\/grills\/([^/]+)\/proposal\/push-back$/,
    )
    if (pushBackRoute && request.method === 'POST') {
      const id = pushBackRoute[1]!
      if (!deps.grillStore.getGrillForUser(id, user.id))
        return json({ error: 'Grill not found' }, 404)
      const body = await readBody(request)
      const notes = typeof body?.notes === 'string' ? body.notes : ''
      try {
        const grill = deps.grillStore.pushBackIssueProposal(
          id,
          notes,
          Date.now(),
        )
        if (!grill) return json({ error: 'No Issue proposal to revise' }, 400)
        if (deps.linkedRuns) {
          void deps.linkedRuns
            .followUp(
              id,
              JSON.stringify({
                type: 'grill.proposal_revision_requested',
                revisionNotes: grill.issueProposal?.revisionNotes,
              }),
            )
            .catch((error) => {
              console.error('Grill follow-up after push-back failed', error)
            })
        }
        return json({ grill })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to push back proposal'
        return json({ error: message }, 400)
      }
    }

    const confirmRoute = url.pathname.match(
      /^\/api\/grills\/([^/]+)\/proposal\/confirm$/,
    )
    if (confirmRoute && request.method === 'POST') {
      const id = confirmRoute[1]!
      if (!deps.grillStore.getGrillForUser(id, user.id))
        return json({ error: 'Grill not found' }, 404)
      try {
        const confirmed = deps.grillStore.confirmIssueProposal(id, Date.now())
        if (!confirmed)
          return json({ error: 'No Issue proposal to confirm' }, 400)
        if (deps.linkedRuns) {
          void deps.linkedRuns
            .followUp(
              id,
              JSON.stringify({
                type: 'grill.proposal_confirmed',
                issues: confirmed.issues,
              }),
            )
            .catch((error) => {
              console.error('Grill follow-up after confirm failed', error)
            })
        }
        return json(confirmed)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to confirm proposal'
        return json({ error: message }, 400)
      }
    }

    const dismissRoute = url.pathname.match(
      /^\/api\/grills\/([^/]+)\/proposal\/dismiss$/,
    )
    if (dismissRoute && request.method === 'POST') {
      const id = dismissRoute[1]!
      if (!deps.grillStore.getGrillForUser(id, user.id))
        return json({ error: 'Grill not found' }, 404)
      try {
        const grill = deps.grillStore.dismissIssueProposal(id, Date.now())
        if (!grill)
          return json({ error: 'No Issue proposal to dismiss' }, 400)
        if (deps.linkedRuns) {
          void deps.linkedRuns
            .followUp(
              id,
              JSON.stringify({ type: 'grill.proposal_dismissed' }),
            )
            .catch((error) => {
              console.error('Grill follow-up after dismiss failed', error)
            })
        }
        return json({ grill })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to dismiss proposal'
        return json({ error: message }, 400)
      }
    }

    const completeRoute = url.pathname.match(
      /^\/api\/grills\/([^/]+)\/complete$/,
    )
    if (completeRoute && request.method === 'POST') {
      const id = completeRoute[1]!
      const grill = deps.grillStore.getGrillForUser(id, user.id)
      if (!grill) return json({ error: 'Grill not found' }, 404)
      const body = await readBody(request)
      if (!body) return json({ error: 'Invalid complete payload' }, 400)
      try {
        const artifact =
          grill.kind === 'general'
            ? {
                title: typeof body.title === 'string' ? body.title : '',
                body: typeof body.body === 'string' ? body.body : '',
              }
            : {
                files: Array.isArray(body.files)
                  ? body.files
                      .filter(
                        (file): file is { path: string; content: string } =>
                          !!file &&
                          typeof file === 'object' &&
                          typeof (file as { path?: unknown }).path ===
                            'string' &&
                          typeof (file as { content?: unknown }).content ===
                            'string',
                      )
                      .map((file) => ({
                        path: file.path,
                        content: file.content,
                      }))
                  : [],
              }
        const completed = await deps.grillStore.completeGrill(
          id,
          artifact,
          Date.now(),
        )
        if (!completed) return json({ error: 'Grill not found' }, 404)
        return json({ grill: completed })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to complete Grill'
        return json({ error: message }, 400)
      }
    }

    const route = url.pathname.match(/^\/api\/grills\/([^/]+)$/)
    if (!route) return undefined
    const id = route[1]!

    if (request.method === 'GET') {
      const grill = deps.grillStore.getGrillForUser(id, user.id)
      if (!grill) return json({ error: 'Grill not found' }, 404)
      const linkedRun = deps.linkedRuns?.getLinkedRun?.(id)
      const latestStep = deps.linkedRuns?.getLatestStep?.(id)
      return json({
        grill,
        ...(linkedRun !== undefined ? { linkedRun } : {}),
        ...(latestStep !== undefined ? { latestStep } : {}),
      })
    }

    if (request.method === 'DELETE') {
      const grill = deps.grillStore.getGrillForUser(id, user.id)
      if (!grill) return json({ error: 'Grill not found' }, 404)
      await deps.linkedRuns?.dispose(id)
      deps.grillStore.discardGrill(id)
      return json({ ok: true })
    }

    return undefined
  }
}
