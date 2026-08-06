import { useCallback, useEffect, useState } from 'react'
import { apiJson, connectWorkspaceStream } from '#/lib/api-transport'
import type { AgentDefinition, Schedule, ScheduleRun } from './types'

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex(({ id }) => id === item.id)
  return index < 0
    ? [...items, item]
    : items.map((value) => (value.id === item.id ? item : value))
}

export function useSchedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [runs, setRuns] = useState<Record<string, ScheduleRun[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    const [scheduleData, agentData] = await Promise.all([
      apiJson<{ schedules: Schedule[] }>(
        '/api/schedules?archived=true',
        undefined,
        'Unable to load schedules',
      ),
      apiJson<{ agents: AgentDefinition[] }>(
        '/api/agent-definitions',
        undefined,
        'Unable to load schedules',
      ),
    ])
    setSchedules(scheduleData.schedules)
    setAgents(agentData.agents)
    await Promise.all(
      scheduleData.schedules.map(async (schedule) => {
        try {
          const data = await apiJson<{ runs: ScheduleRun[] }>(
            `/api/schedules/${schedule.id}/runs?limit=10`,
          )
          setRuns((current) => ({ ...current, [schedule.id]: data.runs }))
        } catch {
          // Best-effort per-schedule run history.
        }
      }),
    )
  }, [])

  useEffect(() => {
    let stopped = false
    void load()
      .catch((reason) => {
        if (!stopped)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to load schedules',
          )
      })
      .finally(() => {
        if (!stopped) setLoading(false)
      })
    const stream = connectWorkspaceStream({
      onMessage(data) {
        if (stopped) return
        const event = JSON.parse(data) as {
          type: string
          schedule?: Schedule
          run?: ScheduleRun
        }
        if (event.type === 'schedule.created' && event.schedule)
          setSchedules((current) => upsert(current, event.schedule!))
        if (event.type === 'schedule.changed' && event.schedule)
          setSchedules((current) => upsert(current, event.schedule!))
        if (
          (event.type === 'schedule_run.created' ||
            event.type === 'schedule_run.changed') &&
          event.run
        )
          setRuns((current) => ({
            ...current,
            [event.run!.scheduleId]: upsert(
              current[event.run!.scheduleId] ?? [],
              event.run!,
            ),
          }))
      },
    })
    return () => {
      stopped = true
      stream.close()
    }
  }, [load])

  const mutate = useCallback(async (path: string, init: RequestInit) => {
    const data = await apiJson<{
      schedule?: Schedule
      run?: ScheduleRun
    }>(path, init, 'Schedule request failed')
    if (data.schedule)
      setSchedules((current) => upsert(current, data.schedule!))
    if (data.run)
      setRuns((current) => ({
        ...current,
        [data.run!.scheduleId]: upsert(
          current[data.run!.scheduleId] ?? [],
          data.run!,
        ),
      }))
    return data
  }, [])

  return {
    schedules,
    agents,
    runs,
    loading,
    error,
    create: (
      input: Omit<
        Schedule,
        'id' | 'state' | 'createdBy' | 'createdAt' | 'updatedAt' | 'nextRunAt'
      >,
    ) =>
      mutate('/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    update: (id: string, input: Partial<Schedule>) =>
      mutate(`/api/schedules/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    runNow: (id: string) =>
      mutate(`/api/schedules/${id}/runs`, { method: 'POST' }),
    cancel: (id: string) =>
      mutate(`/api/schedule-runs/${id}/cancel`, { method: 'POST' }),
    reload: load,
  }
}
