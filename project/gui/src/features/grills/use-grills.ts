import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson, apiJsonBody } from '#/lib/api-transport'
import { docsQueryKey } from '#/features/docs/use-docs'
import type { RunState } from '#/features/runs/run-helpers'
import {
  grillAwaitingWrapUpReview,
  grillIsComplete,
} from './grill-status'
import type {
  Grill,
  GrillCreatedIssue,
  GrillKind,
  GrillLatestStep,
  GrillLinkedRun,
  GrillListItem,
  GrillVisibility,
} from './types'

export const grillsQueryKey = ['grills'] as const
export const grillQueryKey = (id: string) => ['grills', id] as const

export type GrillDetail = {
  grill: Grill
  linkedRun?: GrillLinkedRun
  latestStep?: GrillLatestStep
}

async function fetchGrills(): Promise<GrillListItem[]> {
  const data = await apiJson<{ grills: GrillListItem[] }>(
    '/api/grills',
    undefined,
    'Unable to load Grills',
  )
  return data.grills
}

async function fetchGrill(id: string): Promise<GrillDetail> {
  const data = await apiJson<GrillDetail>(
    `/api/grills/${encodeURIComponent(id)}`,
    undefined,
    'Unable to load Grill',
  )
  return data
}

function upsertGrillCache(
  queryClient: ReturnType<typeof useQueryClient>,
  grill: Grill,
  linkedRun?: GrillLinkedRun,
  latestStep?: GrillLatestStep | null,
) {
  queryClient.setQueryData(
    grillQueryKey(grill.id),
    (current: GrillDetail | undefined): GrillDetail => ({
      grill,
      linkedRun: linkedRun ?? current?.linkedRun,
      latestStep:
        latestStep === null
          ? undefined
          : (latestStep ?? current?.latestStep),
    }),
  )
  queryClient.setQueryData(
    grillsQueryKey,
    (current: GrillListItem[] | undefined) => {
      if (!current) {
        return [
          {
            ...grill,
            ...(linkedRun ? { linkedRun } : {}),
            ...(latestStep ? { latestStep } : {}),
          },
        ]
      }
      const index = current.findIndex((item) => item.id === grill.id)
      const prior = index >= 0 ? current[index] : undefined
      const next: GrillListItem = {
        ...grill,
        ...(linkedRun !== undefined
          ? { linkedRun }
          : prior?.linkedRun
            ? { linkedRun: prior.linkedRun }
            : {}),
        ...(latestStep === null
          ? {}
          : latestStep !== undefined
            ? { latestStep }
            : prior?.latestStep
              ? { latestStep: prior.latestStep }
              : {}),
      }
      if (index < 0) return [...current, next]
      return current.map((item) => (item.id === grill.id ? next : item))
    },
  )
}

function syncGrillIntoListCache(
  queryClient: ReturnType<typeof useQueryClient>,
  detail: GrillDetail,
) {
  queryClient.setQueryData(
    grillsQueryKey,
    (current: GrillListItem[] | undefined) => {
      const next: GrillListItem = {
        ...detail.grill,
        ...(detail.linkedRun ? { linkedRun: detail.linkedRun } : {}),
        ...(detail.latestStep ? { latestStep: detail.latestStep } : {}),
      }
      if (!current) return [next]
      const index = current.findIndex((item) => item.id === detail.grill.id)
      if (index < 0) return [...current, next]
      return current.map((item, i) => {
        if (i !== index) return item
        return {
          ...next,
          linkedRun: detail.linkedRun ?? item.linkedRun,
          // Server omission means no live step (e.g. follow-up just cleared it).
          ...(detail.latestStep ? { latestStep: detail.latestStep } : {}),
        }
      })
    },
  )
}

export function grillTurnActive(grill: {
  linkedRun?: GrillLinkedRun
}): boolean {
  const linkedRun = grill.linkedRun
  if (!linkedRun) return false
  if (linkedRun.turnActive === true) return true
  const state = linkedRun.state as RunState | undefined
  return state === 'preparing'
}

function markGrillFollowUpStarted(
  queryClient: ReturnType<typeof useQueryClient>,
  grill: Grill,
) {
  const current = queryClient.getQueryData<GrillDetail>(grillQueryKey(grill.id))
  const prior = current?.linkedRun
  upsertGrillCache(
    queryClient,
    grill,
    prior ? { ...prior, turnActive: true } : undefined,
    null,
  )
}

function grillListHasActiveRun(grills: GrillListItem[] | undefined) {
  return (
    grills?.some((grill) => {
      if (grill.frontier.questions.length > 0) return false
      if (grillAwaitingWrapUpReview(grill) || grillIsComplete(grill)) return false
      return grillTurnActive(grill)
    }) ?? false
  )
}

export function useGrills(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: grillsQueryKey,
    queryFn: fetchGrills,
    enabled: options?.enabled ?? true,
    refetchInterval: (query) =>
      grillListHasActiveRun(query.state.data) ? 1_000 : 4_000,
  })
}

export function useGrill(id: string | undefined) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: id ? grillQueryKey(id) : ['grills', 'none'],
    queryFn: async () => {
      const detail = await fetchGrill(id!)
      syncGrillIntoListCache(queryClient, detail)
      return detail
    },
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      // Open frontier = Accounts' turn; poll slower.
      if (data.grill.frontier.questions.length > 0) return 4_000
      if (
        grillAwaitingWrapUpReview(data.grill) ||
        grillIsComplete(data.grill)
      ) {
        return 4_000
      }
      const state = data.linkedRun?.state
      if (state === 'failed' || state === 'cancelled') return 4_000
      if (grillTurnActive(data)) return 1_000
      // Empty frontier with warm spine idle: Accounts may reply.
      return 4_000
    },
  })
}

export function useCreateGrill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      kind: GrillKind
      visibility: GrillVisibility
      agentDefinitionId: string
      baseRef?: string
      initialRequest: string
    }): Promise<GrillDetail> => {
      const initialRequest = input.initialRequest.trim()
      if (!initialRequest) throw new Error('Describe what you want to grill')
      const data = await apiJsonBody<{ grill?: Grill }>(
        '/api/grills',
        'POST',
        {
          kind: input.kind,
          visibility: input.visibility,
          agentDefinitionId: input.agentDefinitionId,
          initialRequest,
          ...(input.baseRef ? { baseRef: input.baseRef } : {}),
        },
        'Unable to start Grill',
      )
      if (!data.grill) throw new Error('Unable to start Grill')
      const started = await apiJsonBody<{ run?: GrillLinkedRun }>(
        `/api/grills/${encodeURIComponent(data.grill.id)}/run`,
        'POST',
        {
          // Server appends GRILL_TURN_CONTRACT (never ask in chat).
          task: initialRequest,
        },
        'Unable to start Grill run',
      )
      return {
        grill: data.grill,
        ...(started.run ? { linkedRun: started.run } : {}),
      }
    },
    onSuccess: (detail) => {
      upsertGrillCache(
        queryClient,
        detail.grill,
        detail.linkedRun,
        detail.latestStep,
      )
      void queryClient.invalidateQueries({ queryKey: grillsQueryKey })
    },
  })
}

export function useUpdateGrillDrafts(grillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (drafts: Record<string, string>): Promise<Grill> => {
      const data = await apiJsonBody<{ grill?: Grill }>(
        `/api/grills/${encodeURIComponent(grillId)}/drafts`,
        'PATCH',
        { drafts },
        'Unable to save drafts',
      )
      if (!data.grill) throw new Error('Unable to save drafts')
      return data.grill
    },
    onSuccess: (grill) => {
      upsertGrillCache(queryClient, grill)
    },
  })
}

export function useSubmitGrillRound(grillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      drafts?: Record<string, string>,
    ): Promise<Grill> => {
      const data = await apiJsonBody<{ grill?: Grill }>(
        `/api/grills/${encodeURIComponent(grillId)}/submit`,
        'POST',
        drafts ? { drafts } : {},
        'Unable to submit round',
      )
      if (!data.grill) throw new Error('Unable to submit round')
      return data.grill
    },
    onSuccess: (grill) => {
      // Follow-up starts async; show working immediately and clear prior step.
      markGrillFollowUpStarted(queryClient, grill)
      void queryClient.invalidateQueries({ queryKey: grillsQueryKey })
      void queryClient.invalidateQueries({
        queryKey: grillQueryKey(grillId),
      })
    },
  })
}

export function useReplyToGrill(grillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (message: string): Promise<Grill> => {
      const data = await apiJsonBody<{ grill?: Grill }>(
        `/api/grills/${encodeURIComponent(grillId)}/reply`,
        'POST',
        { message },
        'Unable to reply',
      )
      if (!data.grill) throw new Error('Unable to reply')
      return data.grill
    },
    onSuccess: (grill) => {
      // Follow-up starts async; show working immediately and clear prior step.
      markGrillFollowUpStarted(queryClient, grill)
      void queryClient.invalidateQueries({ queryKey: grillsQueryKey })
      void queryClient.invalidateQueries({
        queryKey: grillQueryKey(grillId),
      })
    },
  })
}

export function usePushBackGrillProposal(grillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (notes: string): Promise<Grill> => {
      const data = await apiJsonBody<{ grill?: Grill }>(
        `/api/grills/${encodeURIComponent(grillId)}/proposal/push-back`,
        'POST',
        { notes },
        'Unable to push back proposal',
      )
      if (!data.grill) throw new Error('Unable to push back proposal')
      return data.grill
    },
    onSuccess: (grill) => {
      // Proposal revision is another agent turn, just like submit/reply.
      markGrillFollowUpStarted(queryClient, grill)
      void queryClient.invalidateQueries({ queryKey: grillsQueryKey })
      void queryClient.invalidateQueries({
        queryKey: grillQueryKey(grillId),
      })
    },
  })
}

export function useConfirmGrillProposal(grillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<{
      grill: Grill
      issues: GrillCreatedIssue[]
    }> => {
      const data = await apiJsonBody<{
        grill?: Grill
        issues?: GrillCreatedIssue[]
      }>(
        `/api/grills/${encodeURIComponent(grillId)}/proposal/confirm`,
        'POST',
        undefined,
        'Unable to confirm proposal',
      )
      if (!data.grill || !data.issues)
        throw new Error('Unable to confirm proposal')
      return { grill: data.grill, issues: data.issues }
    },
    onSuccess: ({ grill }) => {
      upsertGrillCache(queryClient, grill)
      void queryClient.invalidateQueries({ queryKey: ['issues'] })
    },
  })
}

export function useDismissGrillProposal(grillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<Grill> => {
      const data = await apiJsonBody<{ grill?: Grill }>(
        `/api/grills/${encodeURIComponent(grillId)}/proposal/dismiss`,
        'POST',
        undefined,
        'Unable to dismiss proposal',
      )
      if (!data.grill) throw new Error('Unable to dismiss proposal')
      return data.grill
    },
    onSuccess: (grill) => {
      upsertGrillCache(queryClient, grill)
    },
  })
}

export function useCompleteGrill(grillId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      body: string
    }): Promise<Grill> => {
      const data = await apiJsonBody<{ grill?: Grill }>(
        `/api/grills/${encodeURIComponent(grillId)}/complete`,
        'POST',
        input,
        'Unable to complete Grill',
      )
      if (!data.grill) throw new Error('Unable to complete Grill')
      return data.grill
    },
    onSuccess: (grill) => {
      upsertGrillCache(queryClient, grill)
      void queryClient.invalidateQueries({ queryKey: docsQueryKey })
    },
  })
}

export function useDiscardGrill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiJsonBody(
        `/api/grills/${encodeURIComponent(id)}`,
        'DELETE',
        undefined,
        'Unable to discard Grill',
      )
    },
    onSuccess: (_void, id) => {
      queryClient.removeQueries({ queryKey: grillQueryKey(id) })
      queryClient.setQueryData(
        grillsQueryKey,
        (current: GrillListItem[] | undefined) =>
          current?.filter((grill) => grill.id !== id),
      )
    },
  })
}
