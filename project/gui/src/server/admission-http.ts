import type { AdmissionStore } from './admission'
import type { RoomUser } from './room-store'
import { AGENT_MENTION_HANDLES } from './attention'
import type { LlmConfigInput, PublicLlmConfig } from './llm-config'

type AccountInput = {
  email: string
  username: string
  password: string
  name: string
}

export type WorkspaceAccount = {
  id: string
  name: string
  email: string
  username?: string | null
  role?: string | null
  banned?: boolean | null
}

export type AdmissionOptions = {
  store: AdmissionStore
  createAccount: (
    body: AccountInput,
    role: 'admin' | 'user',
  ) => Promise<Response>
  listUsers: () => Promise<WorkspaceAccount[]>
  banUser: (request: Request, userId: string) => Promise<unknown>
  unbanUser: (request: Request, userId: string) => Promise<unknown>
  llm?: {
    public(): PublicLlmConfig
    save(input: LlmConfigInput): PublicLlmConfig
  }
}

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status })

const readBody = async (
  request: Request,
): Promise<Record<string, unknown> | undefined> => {
  try {
    const body: unknown = await request.json()
    return body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

const accountFrom = (
  body: Record<string, unknown> | undefined,
): AccountInput | undefined => {
  const email = body?.email
  const username = body?.username
  const password = body?.password
  const displayName = body?.displayName
  if (
    typeof email !== 'string' ||
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    (displayName !== undefined && typeof displayName !== 'string') ||
    !email.trim() ||
    !username.trim()
  )
    return undefined
  if (AGENT_MENTION_HANDLES.has(username.trim().toLowerCase())) return undefined
  return {
    email: email.trim(),
    username: username.trim(),
    password,
    name:
      (typeof displayName === 'string' && displayName.trim()) ||
      username.trim(),
  }
}

export function createAdmissionHttpHandler(
  options: AdmissionOptions & {
    authenticate: (request: Request) => Promise<RoomUser | undefined>
    guiOrigin: string
    onSuspend: (userId: string) => void
  },
) {
  const administrator = async (
    request: Request,
  ): Promise<RoomUser | Response> => {
    const user = await options.authenticate(request)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    return user.role === 'admin' ? user : json({ error: 'Forbidden' }, 403)
  }

  return async (request: Request, url: URL): Promise<Response | undefined> => {
    if (url.pathname === '/api/admission/status' && request.method === 'GET')
      return json({ setupRequired: !options.store.hasUsers() })

    if (url.pathname === '/api/admission/setup' && request.method === 'POST') {
      const account = accountFrom(await readBody(request))
      const setupToken = request.headers.get('x-sweat-setup-token')
      if (!account || !setupToken || !options.store.claimSetupToken(setupToken))
        return json({ error: 'Invalid or already-used setup token' }, 400)
      let response: Response
      try {
        response = await options.createAccount(account, 'admin')
      } catch {
        options.store.releaseSetupToken()
        return json({ error: 'Unable to create account' }, 502)
      }
      if (!response.ok) {
        options.store.releaseSetupToken()
        return response
      }
      options.store.redeemSetupToken()
      return response
    }

    const redemption = url.pathname.match(
      /^\/api\/(?:admission|workspace)\/invitations\/([^/]+)\/redeem$/,
    )
    if (redemption && request.method === 'POST') {
      const account = accountFrom(await readBody(request))
      const claimed = account
        ? options.store.claimInvitation(redemption[1])
        : undefined
      if (!account || !claimed)
        return json({ error: 'Invitation is not redeemable' }, 400)
      let response: Response
      try {
        response = await options.createAccount(account, 'user')
      } catch {
        options.store.releaseInvitation(claimed.id)
        return json({ error: 'Unable to create account' }, 502)
      }
      if (!response.ok) {
        options.store.releaseInvitation(claimed.id)
        return response
      }
      options.store.redeemInvitation(claimed.id)
      return response
    }

    if (/^\/api\/auth\/(?:sign-up|admin)(?:\/|$)/.test(url.pathname))
      return json({ error: 'Account admission is required' }, 403)

    if (url.pathname === '/api/workspace/invitations') {
      const user = await administrator(request)
      if (user instanceof Response) return user
      if (request.method === 'GET')
        return json({ invitations: options.store.listInvitations() })
      if (request.method === 'POST') {
        const rawDays = (await readBody(request))?.days
        const days = rawDays === undefined ? 3 : rawDays
        if (days !== 1 && days !== 3 && days !== 7)
          return json(
            { error: 'Invitation lifetime must be 1, 3, or 7 days' },
            400,
          )
        const created = options.store.createInvitation(user.id, days)
        return json(
          {
            ...created,
            url: new URL(
              `/invite/${encodeURIComponent(created.token)}`,
              options.guiOrigin,
            ).toString(),
          },
          201,
        )
      }
    }

    const revokeInvitation = url.pathname.match(
      /^\/api\/workspace\/invitations\/([^/]+)$/,
    )
    if (revokeInvitation && request.method === 'DELETE') {
      const user = await administrator(request)
      if (user instanceof Response) return user
      return options.store.revokeInvitation(revokeInvitation[1])
        ? json({ ok: true })
        : json({ error: 'Invitation cannot be revoked' }, 400)
    }

    if (
      url.pathname === '/api/workspace/settings/members' &&
      request.method === 'GET'
    ) {
      const user = await administrator(request)
      return user instanceof Response
        ? user
        : json({ users: await options.listUsers() })
    }

    if (url.pathname === '/api/workspace/settings/llm' && options.llm) {
      const user = await administrator(request)
      if (user instanceof Response) return user
      if (request.method === 'GET') return json(options.llm.public())
      if (request.method === 'POST') {
        const body = await readBody(request)
        try {
          return json(
            options.llm.save({
              baseUrl: typeof body?.baseUrl === 'string' ? body.baseUrl : '',
              model: typeof body?.model === 'string' ? body.model : '',
              ...(typeof body?.apiKey === 'string'
                ? { apiKey: body.apiKey }
                : {}),
            }),
          )
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error ? error.message : 'Invalid LLM provider',
            },
            400,
          )
        }
      }
    }

    const memberAction = url.pathname.match(
      /^\/api\/workspace\/settings\/members\/([^/]+)\/(suspend|restore)$/,
    )
    if (memberAction && request.method === 'POST') {
      const user = await administrator(request)
      if (user instanceof Response) return user
      const userId = memberAction[1]
      if (memberAction[2] === 'suspend' && userId === user.id)
        return json(
          {
            error: 'The workspace administrator cannot suspend themselves',
          },
          400,
        )
      const result =
        memberAction[2] === 'suspend'
          ? await options.banUser(request, userId)
          : await options.unbanUser(request, userId)
      if (memberAction[2] === 'suspend') options.onSuspend(userId)
      return json(result)
    }

    return undefined
  }
}
