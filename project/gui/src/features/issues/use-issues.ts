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

export function upsertIssueInCache(queryClient: QueryClient, issue: Issue) {
  queryClient.setQueryData(issuesQueryKey, (current: Issue[] | undefined) =>
    upsertIssue(current ?? [], issue),
  )
}

async function fetchIssues(): Promise<Issue[]> {
  const response = await apiFetch('/api/issues')
  if (!response.ok) throw new Error('Unable to load issues')
  const data = (await response.json()) as { issues: Issue[] }
  return data.issues
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
          ...(input.status ? { status: input.status } : {}),
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
