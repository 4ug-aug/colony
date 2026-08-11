import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson, apiJsonBody, connectGrillStream } from '#/lib/api-transport'
import type { RealtimeStreamHandle } from '#/lib/api-transport'
import { docsQueryKey } from '#/features/docs/use-docs'
import {
  type GrillListQueryParams,
  toGrillListSearchParams,
} from './grill-filters'
import {
  grillAwaitingWrapUpReview,
  grillIsComplete,
  grillTurnActive,
} from './grill-status'
import type {
  Grill,
  GrillCreatedIssue,
  GrillKind,
  GrillEditLease,
  GrillLatestStep,
  GrillLinkedRun,
  GrillListItem,
  GrillParticipant,
  GrillStreamMessage,
  GrillVisibility,
} from './types'

export { grillTurnActive } from './grill-status'

export const grillsQueryKey = ['grills'] as const
export const grillQueryKey = (id: string) => ['grills', id] as const
export const grillsPageQueryKey = (params: GrillListQueryParams) =>
  [
    'grills',
    'page',
    params.page,
    params.pageSize,
    params.search.trim(),
    params.filters.statuses.slice().sort().join(','),
    params.filters.kinds.slice().sort().join(','),
    params.filters.visibilities.slice().sort().join(','),
  ] as const

export type GrillDetail = {
  grill: Grill
  linkedRun?: GrillLinkedRun
  latestStep?: GrillLatestStep
  narration?: GrillLatestStep[]
}

export type GrillListPageResult = {
  grills: GrillListItem[]
  total: number
  page: number
  pageSize: number
}

async function fetchGrillsPage(
  params: GrillListQueryParams,
): Promise<GrillListPageResult> {
  const search = toGrillListSearchParams(params)
  const data = await apiJson<GrillListPageResult>(
    `/api/grills?${search.toString()}`,
    undefined,
    'Unable to load Grills',
  )
  return data
}

async function fetchGrill(id: string): Promise<GrillDetail> {
  const data = await apiJson<GrillDetail>(
    `/api/grills/${encodeURIComponent(id)}`,
    undefined,
    'Unable to load Grill',
  )
  return data
}

function invalidateGrillList(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  void queryClient.invalidateQueries({ queryKey: grillsQueryKey })
}

function upsertGrillCache(
  queryClient: ReturnType<typeof useQueryClient>,
  grill: Grill,
  linkedRun?: GrillLinkedRun,
  latestStep?: GrillLatestStep | null,
  narration?: GrillLatestStep[],
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
      narration: narration ?? current?.narration,
    }),
  )
  invalidateGrillList(queryClient)
}

function syncGrillIntoListCache(
  queryClient: ReturnType<typeof useQueryClient>,
  _detail: GrillDetail,
) {
  invalidateGrillList(queryClient)
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
    [],
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

export function useGrills(
  params: GrillListQueryParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: grillsPageQueryKey(params),
    queryFn: () => fetchGrillsPage(params),
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      grillListHasActiveRun(query.state.data?.grills) ? 1_000 : 4_000,
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
      // Open frontier = Accounts' realtime turn; polling can overwrite a newer
      // socket draft with a response that started before that draft arrived.
      if (data.grill.frontier.questions.length > 0) return false
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

export function useGrillRealtime(grillId: string) {
  const queryClient = useQueryClient()
  const streamRef = useRef<RealtimeStreamHandle | undefined>(undefined)
  const presenceIdRef = useRef<string | undefined>(undefined)
  const focusedQuestionRef = useRef<string | undefined>(undefined)
  const pendingRef = useRef(
    new Map<string, { value: string; baseValue: string }>(),
  )
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const [connected, setConnected] = useState(false)
  const [presenceId, setPresenceId] = useState<string>()
  const [leases, setLeases] = useState<GrillEditLease[]>([])
  const [participants, setParticipants] = useState<GrillParticipant[]>([])
  const [recoveries, setRecoveries] = useState<Record<string, string>>({})

  const send = useCallback((message: Record<string, unknown>) => {
    streamRef.current?.send(JSON.stringify(message))
  }, [])

  const flushDraft = useCallback(
    (questionId: string) => {
      const timer = timersRef.current.get(questionId)
      if (timer) clearTimeout(timer)
      timersRef.current.delete(questionId)
      const pending = pendingRef.current.get(questionId)
      if (pending)
        send({ type: 'grill.draft', questionId, value: pending.value })
    },
    [send],
  )

  useEffect(() => {
    let stopped = false
    let attempts = 0
    let retry: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      if (stopped) return
      const stream = connectGrillStream(grillId, {
        onOpen() {
          attempts = 0
          setConnected(true)
        },
        onMessage(data) {
          if (stopped) return
          const event = JSON.parse(data) as GrillStreamMessage
          if (event.type === 'grill.snapshot') {
            presenceIdRef.current = event.presenceId
            setPresenceId(event.presenceId)
            setLeases(event.leases)
            setParticipants(event.participants)
            upsertGrillCache(
              queryClient,
              event.grill,
              undefined,
              event.latestStep ?? null,
              event.narration,
            )
            for (const [questionId, pending] of pendingRef.current) {
              const canonical = event.grill.frontier.drafts[questionId] ?? ''
              if (
                canonical !== pending.baseValue &&
                canonical !== pending.value
              ) {
                setRecoveries((current) => ({
                  ...current,
                  [questionId]: pending.value,
                }))
                pendingRef.current.delete(questionId)
              }
            }
            if (focusedQuestionRef.current)
              send({
                type: 'grill.focus',
                questionId: focusedQuestionRef.current,
              })
            return
          }
          if (event.type === 'grill.activity.changed') {
            const current = queryClient.getQueryData<GrillDetail>(
              grillQueryKey(grillId),
            )
            if (current)
              upsertGrillCache(
                queryClient,
                current.grill,
                event.linkedRun ?? current.linkedRun,
                event.latestStep ?? null,
                event.narration,
              )
            return
          }
          if (event.type === 'grill.changed') {
            const previous = queryClient.getQueryData<GrillDetail>(
              grillQueryKey(grillId),
            )
            const hadFrontier =
              (previous?.grill.frontier.questions.length ?? 0) > 0
            const nowEmpty = event.grill.frontier.questions.length === 0
            if (hadFrontier && nowEmpty) {
              markGrillFollowUpStarted(queryClient, event.grill)
            } else {
              upsertGrillCache(queryClient, event.grill)
            }
            const questionIds = new Set(
              event.grill.frontier.questions.map((question) => question.id),
            )
            setLeases((current) =>
              current.filter(({ questionId }) => questionIds.has(questionId)),
            )
            if (
              focusedQuestionRef.current &&
              !questionIds.has(focusedQuestionRef.current)
            ) {
              focusedQuestionRef.current = undefined
            }
            return
          }
          if (event.type === 'grill.presence.changed') {
            setParticipants(event.participants)
            return
          }
          if (event.type === 'grill.lease.changed') {
            setLeases((current) => [
              ...current.filter(
                ({ questionId }) => questionId !== event.questionId,
              ),
              ...(event.lease ? [event.lease] : []),
            ])
            if (event.lease?.presenceId === presenceIdRef.current)
              flushDraft(event.questionId)
            return
          }
          if (event.type === 'grill.draft.changed') {
            const current = queryClient.getQueryData<GrillDetail>(
              grillQueryKey(grillId),
            )
            if (current) {
              upsertGrillCache(queryClient, {
                ...current.grill,
                frontier: {
                  ...current.grill.frontier,
                  drafts: {
                    ...current.grill.frontier.drafts,
                    [event.questionId]: event.value,
                  },
                },
                updatedAt: event.updatedAt,
              })
            }
            const pending = pendingRef.current.get(event.questionId)
            if (pending?.value === event.value) {
              pendingRef.current.delete(event.questionId)
            } else if (pending && event.presenceId === presenceIdRef.current) {
              pending.baseValue = event.value
            } else if (
              pending &&
              event.presenceId !== presenceIdRef.current &&
              event.value !== pending.baseValue
            ) {
              setRecoveries((existing) => ({
                ...existing,
                [event.questionId]: pending.value,
              }))
              pendingRef.current.delete(event.questionId)
            }
            return
          }
          if (event.type === 'grill.run.activity') {
            const current = queryClient.getQueryData<GrillDetail>(
              grillQueryKey(grillId),
            )
            if (!current) return
            upsertGrillCache(
              queryClient,
              current.grill,
              event.linkedRun,
              event.latestStep ?? null,
            )
            return
          }
          const pending = pendingRef.current.get(event.questionId)
          if (pending) {
            setRecoveries((current) => ({
              ...current,
              [event.questionId]: pending.value,
            }))
            pendingRef.current.delete(event.questionId)
          }
        },
        onClose() {
          if (stopped) return
          setConnected(false)
          setLeases([])
          setParticipants([])
          retry = setTimeout(connect, Math.min(1_000 * 2 ** attempts++, 10_000))
        },
        onError() {
          streamRef.current?.close()
        },
      })
      streamRef.current = stream
    }

    connect()
    return () => {
      stopped = true
      if (retry) clearTimeout(retry)
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
      streamRef.current?.close()
    }
  }, [flushDraft, grillId, queryClient, send])

  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (connected && focusedQuestionRef.current)
        send({
          type: 'grill.heartbeat',
          questionId: focusedQuestionRef.current,
        })
    }, 2_000)
    return () => clearInterval(heartbeat)
  }, [connected, send])

  return {
    connected,
    presenceId,
    leases,
    participants,
    recoveries,
    focus(questionId: string) {
      focusedQuestionRef.current = questionId
      send({ type: 'grill.focus', questionId })
    },
    blur(questionId: string) {
      flushDraft(questionId)
      send({ type: 'grill.blur', questionId })
      if (focusedQuestionRef.current === questionId)
        focusedQuestionRef.current = undefined
    },
    change(questionId: string, value: string) {
      const prior = pendingRef.current.get(questionId)
      const detail = queryClient.getQueryData<GrillDetail>(
        grillQueryKey(grillId),
      )
      pendingRef.current.set(questionId, {
        value,
        baseValue:
          prior?.baseValue ?? detail?.grill.frontier.drafts[questionId] ?? '',
      })
      if (timersRef.current.has(questionId)) return
      timersRef.current.set(
        questionId,
        setTimeout(() => flushDraft(questionId), 100),
      )
    },
    dismissRecovery(questionId: string) {
      setRecoveries((current) => {
        const next = { ...current }
        delete next[questionId]
        return next
      })
    },
  }
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
      invalidateGrillList(queryClient)
    },
  })
}
