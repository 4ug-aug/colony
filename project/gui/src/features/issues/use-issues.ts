import type { QueryClient } from '@tanstack/react-query'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '#/lib/api-transport'
import type {
  Issue,
  IssueOwner,
  IssuePriority,
  IssueRun,
  IssueStatus,
} from './types'

export const issuesQueryKey = ['issues'] as const

function upsertIssueRun(
  queryClient: QueryClient,
  run: IssueRun,
) {
  queryClient.setQueryData(
    ['issue-runs', run.issueId],
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

function upsertIssue(issues: Issue[], issue: Issue): Issue[] {
  const index = issues.findIndex(({ id }) => id === issue.id)
  if (index < 0) return [...issues, issue].sort((a, b) => a.number - b.number)
  return issues.map((current) => (current.id === issue.id ? issue : current))
}

/** Recompute parent childProgress from the live list (server field goes stale on upsert). */
export function withDerivedChildProgress(issues: Issue[]): Issue[] {
  const totals = new Map<string, { done: number; total: number }>()
  for (const issue of issues) {
    if (!issue.parentId) continue
    const current = totals.get(issue.parentId) ?? { done: 0, total: 0 }
    current.total += 1
    if (issue.status === 'done') current.done += 1
    totals.set(issue.parentId, current)
  }
  return issues.map((issue) => {
    const progress = totals.get(issue.id)
    if (!progress) {
      if (!issue.childProgress) return issue
      const { childProgress: _removed, ...rest } = issue
      return rest
    }
    return { ...issue, childProgress: progress }
  })
}

export function upsertIssueInCache(queryClient: QueryClient, issue: Issue) {
  queryClient.setQueryData(issuesQueryKey, (current: Issue[] | undefined) =>
    withDerivedChildProgress(upsertIssue(current ?? [], issue)),
  )
}

export function removeIssueFromCache(queryClient: QueryClient, issueId: string) {
  queryClient.setQueryData(issuesQueryKey, (current: Issue[] | undefined) => {
    if (!current) return current
    return withDerivedChildProgress(
      current
        .filter((issue) => issue.id !== issueId)
        .map((issue) => {
          if (issue.parentId !== issueId) return issue
          const { parentId: _removed, ...rest } = issue
          return rest
        }),
    )
  })
  queryClient.removeQueries({ queryKey: ['issue', issueId] })
  queryClient.removeQueries({ queryKey: ['issue-runs', issueId] })
}

async function fetchIssues(): Promise<Issue[]> {
  const response = await apiFetch('/api/issues')
  if (!response.ok) throw new Error('Unable to load issues')
  const data = (await response.json()) as { issues: Issue[] }
  return withDerivedChildProgress(data.issues)
}

export function useIssues(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: issuesQueryKey,
    queryFn: fetchIssues,
    enabled: options?.enabled ?? true,
  })
}

async function fetchIssue(ref: string): Promise<Issue> {
  const response = await apiFetch(`/api/issues/${encodeURIComponent(ref)}`)
  const data = (await response.json()) as { issue?: Issue; error?: string }
  if (!response.ok) throw new Error(data.error ?? 'Unable to load issue')
  if (!data.issue) throw new Error('Unable to load issue')
  return data.issue
}

/** Prefer list cache; fetch single issue only when missing. */
export function useIssue(id: string | undefined) {
  const list = useIssues()
  const cached = id
    ? list.data?.find((issue) => issue.id === id)
    : undefined

  const detail = useQuery({
    queryKey: ['issue', id] as const,
    queryFn: () => fetchIssue(id!),
    enabled: Boolean(id) && !cached && !list.isPending,
  })

  return {
    issue: cached ?? detail.data,
    isPending: Boolean(id) && !cached && (list.isPending || detail.isPending),
    isError: !cached && detail.isError,
    error: detail.error,
  }
}

export type CreateIssueInput = {
  title: string
  description?: string
  status?: IssueStatus
  priority?: IssuePriority
  tags?: string[]
  timeSpent?: number[]
  parentId?: string
  owner?: Issue['owner']
}

export type UpdateIssueInput = {
  id: string
  title?: string
  description?: string
  status?: IssueStatus
  priority?: IssuePriority
  tags?: string[]
  timeSpent?: number[]
  parentId?: string | null
}

export function useCreateIssue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: CreateIssueInput,
    ): Promise<{ issue: Issue; run?: IssueRun }> => {
      const response = await apiFetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: input.title,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.tags ? { tags: input.tags } : {}),
          ...(input.timeSpent ? { timeSpent: input.timeSpent } : {}),
          ...(input.parentId ? { parentId: input.parentId } : {}),
          ...(input.owner ? { owner: input.owner } : {}),
        }),
      })
      const data = (await response.json()) as {
        issue?: Issue
        run?: IssueRun
        error?: string
      }
      if (!response.ok)
        throw new Error(data.error ?? 'Unable to create issue')
      if (!data.issue) throw new Error('Unable to create issue')
      return { issue: data.issue, ...(data.run ? { run: data.run } : {}) }
    },
    onSuccess: ({ issue, run }) => {
      upsertIssueInCache(queryClient, issue)
      if (run) upsertIssueRun(queryClient, run)
    },
  })
}

export function useUpdateIssue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateIssueInput): Promise<Issue> => {
      const { id, ...patch } = input
      const response = await apiFetch(`/api/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = (await response.json()) as { issue?: Issue; error?: string }
      if (!response.ok)
        throw new Error(data.error ?? 'Unable to update issue')
      if (!data.issue) throw new Error('Unable to update issue')
      return data.issue
    },
    onSuccess: (issue) => {
      upsertIssueInCache(queryClient, issue)
    },
  })
}

export function useAssignIssue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      owner: IssueOwner | null
    }): Promise<{ issue: Issue; run?: IssueRun }> => {
      const response = await apiFetch(`/api/issues/${input.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: input.owner }),
      })
      const data = (await response.json()) as {
        issue?: Issue
        run?: IssueRun
        error?: string
      }
      if (!response.ok)
        throw new Error(data.error ?? 'Unable to assign issue')
      if (!data.issue) throw new Error('Unable to assign issue')
      return { issue: data.issue, ...(data.run ? { run: data.run } : {}) }
    },
    onSuccess: ({ issue, run }) => {
      upsertIssueInCache(queryClient, issue)
      if (run) upsertIssueRun(queryClient, run)
    },
  })
}

export function useDeleteIssue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await apiFetch(`/api/issues/${id}`, {
        method: 'DELETE',
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok)
        throw new Error(data.error ?? 'Unable to delete issue')
    },
    onSuccess: (_data, id) => {
      removeIssueFromCache(queryClient, id)
    },
  })
}
