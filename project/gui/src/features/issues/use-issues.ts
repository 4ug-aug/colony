import type { QueryClient } from '@tanstack/react-query'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiJson, apiJsonBody } from '#/lib/api-transport'
import { formatIssueId } from './format'
import type {
  Issue,
  IssueOwner,
  IssuePriority,
  IssueRun,
  IssueStatus,
} from './types'
import {
  issueRunsQueryKey,
  upsertIssueRunInCache,
} from './use-issue-runs'

export const issuesQueryKey = ['issues'] as const

export function invalidateIssues(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: issuesQueryKey })
}

async function fetchIssues(): Promise<Issue[]> {
  const data = await apiJson<{ issues: Issue[] }>(
    '/api/issues',
    undefined,
    'Unable to load issues',
  )
  return data.issues
}

export function useIssues(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: issuesQueryKey,
    queryFn: fetchIssues,
    enabled: options?.enabled ?? true,
  })
}

/** Select from the complete unpaginated list. Accepts id or COL-N. */
export function useIssue(id: string | undefined) {
  const list = useIssues()
  const issue = id
    ? list.data?.find(
        (candidate) =>
          candidate.id === id ||
          formatIssueId(candidate.number).toLowerCase() === id.toLowerCase(),
      )
    : undefined

  return {
    issue,
    isPending: Boolean(id) && list.isPending,
    isError: Boolean(id) && list.isError,
    error: list.error,
  }
}

type CreateIssueInput = {
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
      const data = await apiJsonBody<{
        issue?: Issue
        run?: IssueRun
      }>(
        '/api/issues',
        'POST',
        {
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
        },
        'Unable to create issue',
      )
      if (!data.issue) throw new Error('Unable to create issue')
      return { issue: data.issue, ...(data.run ? { run: data.run } : {}) }
    },
    onSuccess: ({ run }) => {
      invalidateIssues(queryClient)
      if (run) upsertIssueRunInCache(queryClient, run)
    },
  })
}

export function useUpdateIssue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateIssueInput): Promise<Issue> => {
      const { id, ...patch } = input
      const data = await apiJsonBody<{ issue?: Issue }>(
        `/api/issues/${id}`,
        'PATCH',
        patch,
        'Unable to update issue',
      )
      if (!data.issue) throw new Error('Unable to update issue')
      return data.issue
    },
    onSuccess: () => {
      invalidateIssues(queryClient)
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
      const data = await apiJsonBody<{
        issue?: Issue
        run?: IssueRun
      }>(
        `/api/issues/${input.id}/assign`,
        'POST',
        { owner: input.owner },
        'Unable to assign issue',
      )
      if (!data.issue) throw new Error('Unable to assign issue')
      return { issue: data.issue, ...(data.run ? { run: data.run } : {}) }
    },
    onSuccess: ({ run }) => {
      invalidateIssues(queryClient)
      if (run) upsertIssueRunInCache(queryClient, run)
    },
  })
}

export function useDeleteIssue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiJsonBody(
        `/api/issues/${id}`,
        'DELETE',
        undefined,
        'Unable to delete issue',
      )
    },
    onSuccess: (_data, id) => {
      invalidateIssues(queryClient)
      queryClient.removeQueries({ queryKey: issueRunsQueryKey(id) })
    },
  })
}
