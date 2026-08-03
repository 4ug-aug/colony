import { isTauriRuntime, setServerBase } from '#/lib/server-config'

export type InviteDeepLink = { token: string; server: string }

export function parseInviteDeepLink(value: string): InviteDeepLink | undefined {
  try {
    const url = new URL(value)
    const server = new URL(url.searchParams.get('server') ?? '')
    const token = decodeURIComponent(url.pathname.slice(1))
    if (
      url.protocol !== 'sweat:' ||
      url.hostname !== 'invite' ||
      !token ||
      token.includes('/') ||
      (server.protocol !== 'http:' && server.protocol !== 'https:') ||
      server.username ||
      server.password
    )
      return undefined
    return { token, server: server.toString().replace(/\/$/, '') }
  } catch {
    return undefined
  }
}

const inviteFrom = (urls: string[] | null): InviteDeepLink | undefined =>
  urls?.map(parseInviteDeepLink).find(Boolean)

const showInvite = (invite: InviteDeepLink): void => {
  window.history.replaceState(
    null,
    '',
    `/invite/${encodeURIComponent(invite.token)}`,
  )
}

export async function initInviteDeepLinks(): Promise<void> {
  if (!isTauriRuntime()) return
  const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link')
  await onOpenUrl((urls) => {
    const invite = inviteFrom(urls)
    if (!invite) return
    void setServerBase(invite.server).then(() => {
      showInvite(invite)
      window.location.reload()
    })
  })
  const invite = inviteFrom(await getCurrent())
  if (!invite) return
  await setServerBase(invite.server)
  showInvite(invite)
}
