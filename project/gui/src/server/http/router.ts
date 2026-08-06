export type RouteHandler = (
  request: Request,
  url: URL,
  params: Record<string, string>,
) => Promise<Response> | Response

export type Route = {
  method: string
  // pattern like '/api/issues/:ref/runs' — convert :param to capture groups
  path: string
  handle: RouteHandler
}

const compile = (
  path: string,
): { regex: RegExp; keys: string[] } => {
  const keys: string[] = []
  const parts = path.split('/').map((part) => {
    if (part.startsWith(':') && part.length > 1) {
      keys.push(part.slice(1))
      return '([^/]+)'
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  })
  return { regex: new RegExp(`^${parts.join('/')}$`), keys }
}

export function matchRoute(
  routes: Route[],
  method: string,
  pathname: string,
): { handle: RouteHandler; params: Record<string, string> } | undefined {
  for (const route of routes) {
    if (route.method !== method) continue
    const { regex, keys } = compile(route.path)
    const match = pathname.match(regex)
    if (!match) continue
    const params: Record<string, string> = {}
    for (let i = 0; i < keys.length; i++)
      params[keys[i]!] = match[i + 1]!
    return { handle: route.handle, params }
  }
  return undefined
}
