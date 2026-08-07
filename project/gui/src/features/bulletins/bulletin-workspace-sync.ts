import type { QueryClient } from '@tanstack/react-query'
import { connectWorkspaceStream } from '#/lib/api-transport'
import type { Bulletin } from './types'
import { removeBulletinFromCache, upsertBulletinInCache } from './use-bulletins'

let detachBulletinWorkspaceSync: (() => void) | undefined

export function attachBulletinWorkspaceSync(queryClient: QueryClient) {
  detachBulletinWorkspaceSync?.()
  const handle = connectWorkspaceStream({
    onMessage(data) {
      const event = JSON.parse(data) as {
        type: string
        bulletin?: Bulletin
        bulletinId?: string
      }
      if (
        (event.type === 'bulletin.created' ||
          event.type === 'bulletin.changed' ||
          event.type === 'bulletin.moved') &&
        event.bulletin
      )
        upsertBulletinInCache(queryClient, event.bulletin)
      if (event.type === 'bulletin.deleted' && event.bulletinId)
        removeBulletinFromCache(queryClient, event.bulletinId)
    },
  })
  detachBulletinWorkspaceSync = () => handle.close()
}
