import { useQueryClient } from '@tanstack/react-query'
import { toast } from '#/components/ui/toast'
import { useCallback, useSyncExternalStore } from 'react'
import {
  clearIssueTimingSession,
  elapsedMinutes,
  getIssueTimingSession,
  startIssueTimingSession,
  subscribeIssueTiming,
  type IssueTimingSession,
} from './issue-timing'
import { apiFetch } from '#/lib/api-transport'
import {
  issuesQueryKey,
  upsertIssueInCache,
  useUpdateIssue,
  type UpdateIssueInput,
} from './use-issues'
import type { Issue } from './types'

function getServerSnapshot(): IssueTimingSession | null {
  return null
}

async function fetchIssue(issueId: string): Promise<Issue> {
  const response = await apiFetch(`/api/issues/${encodeURIComponent(issueId)}`)
  const data = (await response.json()) as { issue?: Issue; error?: string }
  if (!response.ok) throw new Error(data.error ?? 'Unable to load issue')
  if (!data.issue) throw new Error('Unable to load issue')
  return data.issue
}

function useIssueTimingSession(): IssueTimingSession | null {
  return useSyncExternalStore(
    subscribeIssueTiming,
    getIssueTimingSession,
    getServerSnapshot,
  )
}

export function useIssueTiming() {
  const session = useIssueTimingSession()
  const queryClient = useQueryClient()
  const updateIssue = useUpdateIssue()

  const resolveIssue = useCallback(
    async (issueId: string): Promise<Issue | undefined> => {
      const issues = queryClient.getQueryData<Issue[]>(issuesQueryKey)
      const cached = issues?.find((issue) => issue.id === issueId)
      if (cached) return cached
      try {
        const issue = await fetchIssue(issueId)
        upsertIssueInCache(queryClient, issue)
        return issue
      } catch {
        return undefined
      }
    },
    [queryClient],
  )

  const appendElapsed = useCallback(
    async (active: IssueTimingSession): Promise<boolean> => {
      const minutes = elapsedMinutes(active.startedAt)
      if (minutes <= 0) return true

      const issue = await resolveIssue(active.issueId)
      if (!issue) {
        toast.add({
          type: 'error',
          title: 'Could not save time spent',
          description: 'Issue is not loaded. Keep timing and try again.',
        })
        return false
      }

      const input: UpdateIssueInput = {
        id: issue.id,
        timeSpent: [...issue.timeSpent, minutes],
      }
      try {
        await updateIssue.mutateAsync(input)
        return true
      } catch (reason) {
        toast.add({
          type: 'error',
          title: 'Could not save time spent',
          description:
            reason instanceof Error ? reason.message : 'Please try again.',
        })
        return false
      }
    },
    [resolveIssue, updateIssue],
  )

  const startTiming = useCallback((issueId: string) => {
    startIssueTimingSession(issueId)
  }, [])

  const stopTiming = useCallback(async () => {
    const active = getIssueTimingSession()
    if (!active) return
    const saved = await appendElapsed(active)
    if (saved) clearIssueTimingSession()
  }, [appendElapsed])

  const switchTiming = useCallback(
    async (issueId: string) => {
      const active = getIssueTimingSession()
      if (active?.issueId === issueId) return
      if (active) {
        const saved = await appendElapsed(active)
        if (!saved) return
      }
      startIssueTimingSession(issueId)
    },
    [appendElapsed],
  )

  return {
    session,
    isPending: updateIssue.isPending,
    startTiming,
    stopTiming,
    switchTiming,
  }
}
