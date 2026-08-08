import type { QueryClient } from '@tanstack/react-query'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '#/lib/api-transport'
import type { Doc } from './types'

export const docsQueryKey = ['docs'] as const
export const docQueryKey = (id: string) => ['docs', id] as const

function upsertDoc(docs: Doc[], doc: Doc): Doc[] {
  const index = docs.findIndex(({ id }) => id === doc.id)
  if (index < 0) return [...docs, doc]
  return docs.map((current) => (current.id === doc.id ? doc : current))
}

export function upsertDocInCache(queryClient: QueryClient, doc: Doc) {
  queryClient.setQueryData(docsQueryKey, (current: Doc[] | undefined) =>
    upsertDoc(current ?? [], doc),
  )
  queryClient.setQueryData(docQueryKey(doc.id), doc)
}

async function fetchDocs(): Promise<Doc[]> {
  const data = await apiJson<{ docs: Doc[] }>(
    '/api/docs',
    undefined,
    'Unable to load Docs',
  )
  return data.docs
}

async function fetchDoc(id: string): Promise<Doc> {
  const data = await apiJson<{ doc: Doc }>(
    `/api/docs/${encodeURIComponent(id)}`,
    undefined,
    'Unable to load Doc',
  )
  return data.doc
}

export function useDocs(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: docsQueryKey,
    queryFn: fetchDocs,
    enabled: options?.enabled ?? true,
  })
}

export function useDoc(id: string | undefined) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: docQueryKey(id ?? ''),
    queryFn: () => fetchDoc(id!),
    enabled: Boolean(id),
    initialData: () => {
      if (!id) return undefined
      return queryClient
        .getQueryData<Doc[]>(docsQueryKey)
        ?.find((doc) => doc.id === id)
    },
  })
}
