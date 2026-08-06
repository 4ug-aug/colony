import type { QueryClient } from '@tanstack/react-query'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiJson, apiJsonBody } from '#/lib/api-transport'
import type { Issue, IssueRun } from './types'
import type { IssueRunStep } from '#/server/issue-store'
import { upsertIssueInCache } from './use-issues'

export type { IssueRunStep }

export function issueRunsQueryKey(issueId: string) {
  return ['issue-runs', issueId] as const
}

export function issueRunStepsQueryKey(runId: string) {
  return ['issue-run-steps', runId] as const
}

export function upsertIssueRunInCache(queryClient: QueryClient, run: IssueRun) {
  queryClient.setQueryData(
    issueRunsQueryKey(run.issueId),
    (current: IssueRun[] | undefined) => {
      const runs = current ?? []
      const index = runs.findIndex(({ id }) => id === run.id)
      if (index < 0)
        return [run, ...runs].sort((a, b) => b.createdAt - a.createdAt)
      return runs
        .map((existing) => (existing.id === run.id ? run : existing))
        .sort((a, b) => b.createdAt - a.createdAt)
    },
  )
}

export function appendIssueRunStepInCache(
  queryClient: QueryClient,
  runId: string,
  step: IssueRunStep,
) {
  queryClient.setQueryData(
    issueRunStepsQueryKey(runId),
    (current: IssueRunStep[] | undefined) => {
      if (!current) return current
      if (current.some((existing) => existing.id === step.id)) return current
      return [...current, step].sort((a, b) => a.idx - b.idx)
    },
  )
}

async function fetchIssueRuns(issueId: string): Promise<IssueRun[]> {
  const data = await apiJson<{ runs?: IssueRun[] }>(
    `/api/issues/${encodeURIComponent(issueId)}/runs`,
    undefined,
    'Unable to load runs',
  )
  return (data.runs ?? []).slice().sort((a, b) => b.createdAt - a.createdAt)
}

async function fetchIssueRunSteps(runId: string): Promise<IssueRunStep[]> {
  const data = await apiJson<{ steps?: IssueRunStep[] }>(
    `/api/issue-runs/${encodeURIComponent(runId)}/steps`,
    undefined,
    'Unable to load run activity',
  )
  return data.steps ?? []
}

export function useIssueRuns(issueId: string | undefined) {
  return useQuery({
    queryKey: issueId ? issueRunsQueryKey(issueId) : ['issue-runs', 'none'],
    queryFn: () => fetchIssueRuns(issueId!),
    enabled: Boolean(issueId),
  })
}

export function useIssueRunSteps(runId: string | undefined) {
  return useQuery({
    queryKey: runId
      ? issueRunStepsQueryKey(runId)
      : ['issue-run-steps', 'none'],
    queryFn: () => fetchIssueRunSteps(runId!),
    enabled: Boolean(runId),
  })
}

export function useStartIssueRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      issueId: string
      agentDefinitionId?: string
    }): Promise<{ issue: Issue; run: IssueRun }> => {
      const data = await apiJsonBody<{
        issue?: Issue
        run?: IssueRun
      }>(
        `/api/issues/${encodeURIComponent(input.issueId)}/runs`,
        'POST',
        input.agentDefinitionId
          ? { agentDefinitionId: input.agentDefinitionId }
          : {},
        'Unable to start run',
      )
      if (!data.issue || !data.run) throw new Error('Unable to start run')
      return { issue: data.issue, run: data.run }
    },
    onSuccess: ({ issue, run }) => {
      upsertIssueInCache(queryClient, issue)
      upsertIssueRunInCache(queryClient, run)
    },
  })
}

export function useCancelIssueRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (runId: string): Promise<IssueRun> => {
      const data = await apiJsonBody<{ run?: IssueRun }>(
        `/api/issue-runs/${encodeURIComponent(runId)}/cancel`,
        'POST',
        undefined,
        'Unable to cancel run',
      )
      if (!data.run) throw new Error('Unable to cancel run')
      return data.run
    },
    onSuccess: (run) => {
      upsertIssueRunInCache(queryClient, run)
    },
  })
}
