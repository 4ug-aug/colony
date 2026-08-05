import type { QueryClient } from '@tanstack/react-query'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '#/lib/api-transport'
import type { Issue, IssuePriority, IssueStatus } from './types'

export const issuesQueryKey = ['issues'] as const

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

async function fetchIssues(): Promise<Issue[]> {
  const response = await apiFetch('/api/issues')
  if (!response.ok) throw new Error('Unable to load issues')
  const data = (await response.json()) as { issues: Issue[] }
  return withDerivedChildProgress(data.issues)
}

export function useIssues() {
  return useQuery({
    queryKey: issuesQueryKey,
    queryFn: fetchIssues,
  })
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
  status?: IssueStatus
  priority?: IssuePriority
}

export function useCreateIssue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateIssueInput): Promise<Issue> => {
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
      const data = (await response.json()) as { issue?: Issue; error?: string }
      if (!response.ok)
        throw new Error(data.error ?? 'Unable to create issue')
      if (!data.issue) throw new Error('Unable to create issue')
      return data.issue
    },
    onSuccess: (issue) => {
      upsertIssueInCache(queryClient, issue)
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
