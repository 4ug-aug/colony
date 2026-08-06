import { isDesktopOrigin } from '#/lib/desktop-origins'

export const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status })

export const withCors = (response: Response, origin: string): Response => {
  const headers = new Headers(response.headers)
  headers.set('access-control-allow-origin', origin)
  headers.set('access-control-allow-credentials', 'true')
  headers.set('vary', 'Origin')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export const allowedOrigin = (
  origin: string | null,
  configured: string,
): string | undefined => {
  if (origin === configured) return origin
  if (isDesktopOrigin(origin)) return origin
  if (
    new URL(configured).hostname === 'localhost' &&
    origin !== null &&
    /^http:\/\/localhost:\d+$/.test(origin)
  )
    return origin
  return undefined
}

export async function readBody(
  request: Request,
): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json()
    return body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}
