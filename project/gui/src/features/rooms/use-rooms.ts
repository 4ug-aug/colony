import { useEffect, useRef, useState } from 'react'
import { sweatApiUrl } from '#/lib/auth-client'
import type { Room, RoomMessage, RoomRun, StreamMessage } from './types'
import type { Step } from '#/features/runs/step-label'

function roomStreamUrl(roomId: string) {
  const url = new URL(sweatApiUrl(`/api/rooms/${roomId}/stream`))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function upsert<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex(({ id }) => id === item.id)
  return index < 0
    ? [...items, item]
    : items.map((value) => (value.id === item.id ? item : value))
}

function orderedRooms(rooms: Room[]) {
  return [...rooms].sort(
    (a, b) =>
      (a.id === 'general' ? -1 : b.id === 'general' ? 1 : 0) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  )
}

const selectedRoomKey = 'sweat.selected-room'

export function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string>()
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [runs, setRuns] = useState<RoomRun[]>([])
  const runsRef = useRef<RoomRun[]>([])
  const [latestStepByRun, setLatestStepByRun] = useState<Map<string, Step>>(new Map())
  const [liveStepsByRun, setLiveStepsByRun] = useState<Map<string, Step[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [, setDraftVersion] = useState(0)
  const [connection, setConnection] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('connecting')
  const [error, setError] = useState<string>()
  const [createError, setCreateError] = useState<string>()
  const [membersChangedAt, setMembersChangedAt] = useState<Record<string, number>>({})
  const socket = useRef<WebSocket | undefined>(undefined)
  const drafts = useRef<Record<string, string>>({})

  useEffect(() => {
    void fetch(sweatApiUrl('/api/rooms'), { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load rooms')
        const result = (await response.json()) as { rooms: Room[] }
        setRooms(orderedRooms(result.rooms))
        const saved = localStorage.getItem(selectedRoomKey)
        setSelectedRoomId(
          result.rooms.some(({ id }) => id === saved)
            ? saved!
            : (
                result.rooms.find(({ id }) => id === 'general') ??
                result.rooms.at(0)
              )?.id,
        )
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : 'Unable to load rooms',
        ),
      )
  }, [])

  useEffect(() => {
    if (!selectedRoomId) return
    let stopped = false
    let attempts = 0
    let retry: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
      if (stopped) return
      const next = new WebSocket(roomStreamUrl(selectedRoomId))
      socket.current = next
      next.onopen = () => {
        attempts = 0
        setConnection('connected')
      }
      next.onmessage = ({ data }) => {
        const event = JSON.parse(data) as StreamMessage
        if (stopped) return
        if (event.type === 'room.created') {
          setRooms((current) => orderedRooms(upsert(current, event.room)))
          return
        }
        if (event.type === 'room.snapshot') {
          if (event.room.id !== selectedRoomId) return
          setMessages(event.messages)
          runsRef.current = event.runs
          setRuns(event.runs)
          setLatestStepByRun(new Map(event.latestSteps.map((s) => [s.runId, s])))
          setLiveStepsByRun(
            new Map(event.latestSteps.map((step) => [step.runId, [step]])),
          )
          setLoading(false)
        }
        if (
          event.type === 'message.created' &&
          event.message.roomId === selectedRoomId
        )
          setMessages((current) => upsert(current, event.message))
        if (event.type === 'run.changed' && event.run.roomId === selectedRoomId) {
          runsRef.current = upsert(runsRef.current, event.run)
          setRuns((current) => upsert(current, event.run))
        }
        if (event.type === 'run.step' && runsRef.current.some((r) => r.id === event.runId)) {
          setLatestStepByRun((current) => {
            const next = new Map(current)
            next.set(event.runId, event.step)
            return next
          })
          setLiveStepsByRun((current) => {
            const next = new Map(current)
            next.set(event.runId, upsert(current.get(event.runId) ?? [], event.step))
            return next
          })
        }
        if (event.type === 'room.removed') {
          setRooms((current) => {
            const next = current.filter(({ id }) => id !== event.roomId)
            setSelectedRoomId((currentId) => {
              if (currentId !== event.roomId) return currentId
              const fallback =
                next.find(({ id }) => id === 'general') ?? next.at(0)
              const fallbackId = fallback?.id
              if (fallbackId) localStorage.setItem(selectedRoomKey, fallbackId)
              return fallbackId
            })
            return next
          })
        }
        if (event.type === 'room.members.changed') {
          setMembersChangedAt((current) => ({
            ...current,
            [event.roomId]: Date.now(),
          }))
        }
      }
      next.onclose = () => {
        if (stopped) return
        if (attempts++ >= 5) {
          setConnection('disconnected')
          setError('Coordinator unavailable')
          return
        }
        setConnection('reconnecting')
        retry = setTimeout(connect, Math.min(1_000 * 2 ** attempts, 10_000))
      }
      next.onerror = () => next.close()
    }
    connect()
    return () => {
      stopped = true
      if (retry) clearTimeout(retry)
      socket.current?.close()
    }
  }, [selectedRoomId])

  const post = async <T,>(
    path: string,
    body?: unknown,
  ): Promise<T | undefined> => {
    try {
      const response = await fetch(sweatApiUrl(path), {
        method: 'POST',
        credentials: 'include',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const result = (await response.json()) as T & { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Request failed')
      setError(undefined)
      return result
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Request failed')
    }
  }

  return {
    rooms,
    room: rooms.find(({ id }) => id === selectedRoomId),
    messages,
    runs,
    latestStepByRun,
    liveStepsByRun,
    loading,
    connection,
    error,
    membersChangedAt,
    select: (roomId: string) => {
      if (roomId === selectedRoomId) return
      setSelectedRoomId(roomId)
      localStorage.setItem(selectedRoomKey, roomId)
      setMessages([])
      setRuns([])
      setLatestStepByRun(new Map())
      setLiveStepsByRun(new Map())
      setLoading(true)
      setConnection('connecting')
    },
    draft: selectedRoomId ? (drafts.current[selectedRoomId] ?? '') : '',
    setDraft: (text: string) => {
      if (selectedRoomId) {
        drafts.current[selectedRoomId] = text
        setDraftVersion((version) => version + 1)
      }
    },
    create: async (name: string, visibility: 'public' | 'private' = 'public') => {
      try {
        const response = await fetch(sweatApiUrl('/api/rooms'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, visibility }),
        })
        const result = (await response.json()) as {
          room?: Room
          error?: string
        }
        if (!response.ok || !result.room)
          throw new Error(result.error ?? 'Unable to create room')
        setCreateError(undefined)
        setError(undefined)
        setRooms((current) => orderedRooms(upsert(current, result.room!)))
        setSelectedRoomId(result.room.id)
        localStorage.setItem(selectedRoomKey, result.room.id)
        setMessages([])
        setRuns([])
        setLatestStepByRun(new Map())
        setLiveStepsByRun(new Map())
        setLoading(true)
        setConnection('connecting')
        return result
      } catch (reason) {
        setCreateError(
          reason instanceof Error ? reason.message : 'Unable to create room',
        )
      }
    },
    createError,
    send: async (text: string) => {
      if (!selectedRoomId) return
      const result = await post<{ message: RoomMessage; run?: RoomRun }>(
        `/api/rooms/${selectedRoomId}/messages`,
        { text },
      )
      if (result) {
        setMessages((current) => upsert(current, result.message))
        if (result.run) setRuns((current) => upsert(current, result.run!))
      }
      return result
    },
    cancel: (runId: string) =>
      selectedRoomId
        ? post(`/api/rooms/${selectedRoomId}/runs/${runId}/cancel`)
        : undefined,
  }
}
