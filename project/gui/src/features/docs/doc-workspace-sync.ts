import type { QueryClient } from '@tanstack/react-query'
import { connectWorkspaceStream } from '#/lib/api-transport'
import type { Doc } from './types'
import { upsertDocInCache } from './use-docs'

let detachDocWorkspaceSync: (() => void) | undefined

export function attachDocWorkspaceSync(queryClient: QueryClient) {
  detachDocWorkspaceSync?.()
  const handle = connectWorkspaceStream({
    onMessage(data) {
      const event = JSON.parse(data) as {
        type: string
        doc?: Doc
      }
      if (
        (event.type === 'doc.created' || event.type === 'doc.changed') &&
        event.doc
      )
        upsertDocInCache(queryClient, event.doc)
    },
  })
  detachDocWorkspaceSync = () => handle.close()
}
