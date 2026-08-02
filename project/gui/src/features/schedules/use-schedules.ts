import { useCallback, useEffect, useState } from 'react'
import { apiFetch, connectWorkspaceStream } from '#/lib/api-transport'
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
    const [scheduleResponse, agentResponse] = await Promise.all([
      apiFetch('/api/schedules?archived=true'),
      apiFetch('/api/agent-definitions'),
    ])
    if (!scheduleResponse.ok || !agentResponse.ok)
      throw new Error('Unable to load schedules')
    const scheduleData = (await scheduleResponse.json()) as {
      schedules: Schedule[]
    }
    const agentData = (await agentResponse.json()) as {
      agents: AgentDefinition[]
    }
    setSchedules(scheduleData.schedules)
    setAgents(agentData.agents)
    await Promise.all(
      scheduleData.schedules.map(async (schedule) => {
        const response = await apiFetch(
          `/api/schedules/${schedule.id}/runs?limit=10`,
        )
        if (!response.ok) return
        const data = (await response.json()) as { runs: ScheduleRun[] }
        setRuns((current) => ({ ...current, [schedule.id]: data.runs }))
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
    const response = await apiFetch(path, init)
    const data = (await response.json()) as {
      schedule?: Schedule
      run?: ScheduleRun
      error?: string
    }
    if (!response.ok) throw new Error(data.error ?? 'Schedule request failed')
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
