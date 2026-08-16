import { useQuery } from '@tanstack/react-query'
import { apiJson } from '#/lib/api-transport'
import type { AccountRunAnalytics } from '#/server/features/rooms/room-store'

export function useAccountAnalytics(accountId: string) {
  return useQuery({
    queryKey: ['account-analytics', accountId],
    queryFn: async () => {
      const data = await apiJson<{ analytics: AccountRunAnalytics }>(
        '/api/account/analytics',
        undefined,
        'Could not load analytics',
      )
      return data.analytics
    },
    staleTime: 30_000,
  })
}

export function countUpValue(from: number, to: number, progress: number) {
  const eased = 1 - (1 - Math.max(0, Math.min(progress, 1))) ** 3
  return Math.round(from + (to - from) * eased)
}

export function formatRuntime(runtimeMs: number) {
  const minutes = Math.floor(Math.max(0, runtimeMs) / 60_000)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
