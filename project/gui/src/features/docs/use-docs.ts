import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson, apiJsonBody } from '#/lib/api-transport'
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

export function removeDocFromCache(queryClient: QueryClient, docId: string) {
  queryClient.setQueryData(docsQueryKey, (current: Doc[] | undefined) => {
    if (!current) return current
    return current.filter((doc) => doc.id !== docId)
  })
  queryClient.removeQueries({ queryKey: docQueryKey(docId) })
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

export function useDeleteDoc() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiJsonBody(
        `/api/docs/${encodeURIComponent(id)}`,
        'DELETE',
        undefined,
        'Unable to delete Doc',
      )
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: docsQueryKey })
      const previous = queryClient.getQueryData<Doc[]>(docsQueryKey)
      removeDocFromCache(queryClient, id)
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous)
        queryClient.setQueryData(docsQueryKey, context.previous)
    },
  })
}
