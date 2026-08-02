import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  apiFetch,
  connectRoomStream,
  connectWorkspaceStream,
} from '#/lib/api-transport'
import type { RealtimeStreamHandle } from '#/lib/api-transport'
import type {
  MentionableAccount,
  Room,
  RoomHistoryPage,
  RoomMessage,
  RoomRun,
  RoomStreamMessage,
  WorkspaceStreamMessage,
} from './types'
import type { Step } from '#/features/runs/step-label'
import { toast } from '#/components/ui/toast'
import { compareMessageMarkers, roomNotification } from './room-notifications'
import type { RoomNotification } from './room-notifications'

function upsert<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex(({ id }) => id === item.id)
  return index < 0
    ? [...items, item]
    : items.map((value) => (value.id === item.id ? item : value))
}

function mergeMessages(messages: RoomMessage[], incoming: RoomMessage[]) {
  const byId = new Map(messages.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )
}

function mergeRuns(runs: RoomRun[], incoming: RoomRun[]) {
  const byId = new Map(runs.map((run) => [run.id, run]))
  for (const run of incoming) byId.set(run.id, run)
  return [...byId.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )
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
const seenRoomMessagesKey = 'sweat.seen-room-messages'

function readSeenRoomMessages() {
  try {
    const value = JSON.parse(
      localStorage.getItem(seenRoomMessagesKey) ?? '{}',
    ) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, marker]) =>
          marker &&
          typeof marker === 'object' &&
          typeof (marker as { id?: unknown }).id === 'string' &&
          typeof (marker as { createdAt?: unknown }).createdAt === 'number',
      ),
    ) as Partial<
      Record<string, { id: string; createdAt: number; authorId: string }>
    >
  } catch {
    return {}
  }
}

function playMentionSound() {
  const context = new AudioContext()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.value = 880
  gain.gain.setValueAtTime(0.06, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18)
  oscillator.connect(gain).connect(context.destination)
  oscillator.addEventListener('ended', () => void context.close())
  oscillator.start()
  oscillator.stop(context.currentTime + 0.18)
}

export function useRooms(userId: string) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string>()
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [runs, setRuns] = useState<RoomRun[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const runsRef = useRef<RoomRun[]>([])
  const [latestStepByRun, setLatestStepByRun] = useState<Map<string, Step>>(
    new Map(),
  )
  const [liveStepsByRun, setLiveStepsByRun] = useState<Map<string, Step[]>>(
    new Map(),
  )
  const [loading, setLoading] = useState(true)
  const [connection, setConnection] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('connecting')
  const [error, setError] = useState<string>()
  const [createError, setCreateError] = useState<string>()
  const [membersChangedAt, setMembersChangedAt] = useState<
    Record<string, number>
  >({})
  const [mentionableAccounts, setMentionableAccounts] = useState<
    MentionableAccount[]
  >([])
  const roomSocket = useRef<RealtimeStreamHandle | undefined>(undefined)
  const workspaceSocket = useRef<RealtimeStreamHandle | undefined>(undefined)
  const selectedRoomRef = useRef<string | undefined>(undefined)
  const nextCursorRef = useRef<string | undefined>(undefined)
  const loadingOlderRef = useRef(false)
  const historyReadyRef = useRef(false)
  const drafts = useRef<Record<string, string>>({})
  const seenRoomMessagesRef = useRef(readSeenRoomMessages())
  const [seenVersion, setSeenVersion] = useState(0)

  const markRoomSeen = useCallback(
    (
      roomId: string,
      marker: { id: string; createdAt: number; authorId: string },
    ) => {
      const previous = seenRoomMessagesRef.current[roomId]
      if (previous && compareMessageMarkers(marker, previous) <= 0) return
      const next = { ...seenRoomMessagesRef.current, [roomId]: marker }
      seenRoomMessagesRef.current = next
      localStorage.setItem(seenRoomMessagesKey, JSON.stringify(next))
      setSeenVersion((version) => version + 1)
    },
    [],
  )

  const recordMessageActivity = useCallback(
    (activity: {
      roomId: string
      messageId: string
      createdAt: number
      authorId: string
    }) => {
      if (activity.authorId === userId) return
      const marker = {
        id: activity.messageId,
        createdAt: activity.createdAt,
        authorId: activity.authorId,
      }
      setRooms((current) =>
        current.map((room) => {
          if (
            room.id !== activity.roomId ||
            (room.latestOtherMessage &&
              compareMessageMarkers(marker, room.latestOtherMessage) <= 0)
          )
            return room
          return { ...room, latestOtherMessage: marker }
        }),
      )
      if (
        selectedRoomRef.current === activity.roomId &&
        document.visibilityState === 'visible'
      )
        markRoomSeen(activity.roomId, marker)
    },
    [markRoomSeen, userId],
  )

  const forgetRoom = useCallback((roomId: string) => {
    if (seenRoomMessagesRef.current[roomId]) {
      const next = { ...seenRoomMessagesRef.current }
      delete next[roomId]
      seenRoomMessagesRef.current = next
      localStorage.setItem(seenRoomMessagesKey, JSON.stringify(next))
      setSeenVersion((version) => version + 1)
    }
    setRooms((current) => {
      const next = current.filter(({ id }) => id !== roomId)
      setSelectedRoomId((currentId) => {
        if (currentId !== roomId) return currentId
        const fallback = next.find(({ id }) => id === 'general') ?? next.at(0)
        const fallbackId = fallback?.id
        if (fallbackId) localStorage.setItem(selectedRoomKey, fallbackId)
        return fallbackId
      })
      return next
    })
  }, [])

  const acknowledge = useCallback(async (roomId: string) => {
    const response = await apiFetch(
      `/api/rooms/${roomId}/attention/acknowledge`,
      { method: 'POST' },
    )
    if (!response.ok) return
    setRooms((current) =>
      current.map((room) =>
        room.id === roomId
          ? { ...room, attentionCount: 0, mentionCount: 0 }
          : room,
      ),
    )
  }, [])

  useEffect(() => {
    selectedRoomRef.current = selectedRoomId
  }, [selectedRoomId])

  useEffect(() => {
    if (document.visibilityState !== 'visible' || !selectedRoomId) return
    const room = rooms.find(({ id }) => id === selectedRoomId)
    if (room?.latestOtherMessage) markRoomSeen(room.id, room.latestOtherMessage)
  }, [markRoomSeen, rooms, selectedRoomId])

  useEffect(() => {
    let stopped = false
    let attempts = 0
    let retry: ReturnType<typeof setTimeout> | undefined
    const selectFrom = (nextRooms: Room[]) => {
      setSelectedRoomId((current) => {
        if (current && nextRooms.some(({ id }) => id === current))
          return current
        const saved = localStorage.getItem(selectedRoomKey)
        return nextRooms.some(({ id }) => id === saved)
          ? saved!
          : (nextRooms.find(({ id }) => id === 'general') ?? nextRooms.at(0))
              ?.id
      })
    }
    const connect = () => {
      if (stopped) return
      workspaceSocket.current = connectWorkspaceStream({
        onOpen() {
          attempts = 0
        },
        onMessage(data) {
          const event = JSON.parse(data) as WorkspaceStreamMessage
          if (stopped) return
          if (event.type === 'workspace.snapshot') {
            const next = orderedRooms(event.rooms)
            setRooms(next)
            selectFrom(next)
          }
          if (event.type === 'room.created')
            setRooms((current) => orderedRooms(upsert(current, event.room)))
          if (event.type === 'room.removed') forgetRoom(event.roomId)
          if (event.type === 'attention.changed') {
            const alreadyViewing =
              selectedRoomRef.current === event.roomId &&
              document.visibilityState === 'visible'
            setRooms((current) =>
              current.map((room) =>
                room.id === event.roomId
                  ? {
                      ...room,
                      attentionCount: event.attentionCount,
                      mentionCount: event.mentionCount,
                    }
                  : room,
              ),
            )
            if (
              event.kind === 'mention' &&
              event.attentionCount > 0 &&
              !alreadyViewing
            ) {
              toast.add({
                type: 'info',
                title: 'You were mentioned',
                description: `New mention in ${event.roomName}`,
              })
              playMentionSound()
            }
            if (event.attentionCount > 0 && alreadyViewing)
              void acknowledge(event.roomId)
          }
          if (event.type === 'message.created') recordMessageActivity(event)
        },
        onClose() {
          if (stopped) return
          retry = setTimeout(connect, Math.min(1_000 * 2 ** attempts++, 10_000))
        },
        onError() {
          workspaceSocket.current?.close()
        },
      })
    }

    void apiFetch('/api/rooms')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load rooms')
        const result = (await response.json()) as { rooms: Room[] }
        if (stopped) return
        const next = orderedRooms(result.rooms)
        setRooms(next)
        selectFrom(next)
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : 'Unable to load rooms',
        ),
      )
      .finally(connect)

    return () => {
      stopped = true
      if (retry) clearTimeout(retry)
      workspaceSocket.current?.close()
    }
  }, [acknowledge, forgetRoom, recordMessageActivity])

  useEffect(() => {
    if (!selectedRoomId) return
    historyReadyRef.current = false
    nextCursorRef.current = undefined
    let stopped = false
    let attempts = 0
    let retry: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      if (stopped) return
      const handle = connectRoomStream(selectedRoomId, {
        onOpen() {
          attempts = 0
          setConnection('connected')
        },
        onMessage(data) {
          const event = JSON.parse(data) as RoomStreamMessage
          if (stopped) return
          if (event.type === 'room.snapshot') {
            if (event.room.id !== selectedRoomId) return
            setRooms((current) =>
              current.map((room) =>
                room.id === event.room.id
                  ? {
                      ...room,
                      ...event.room,
                    }
                  : room,
              ),
            )
            if (!historyReadyRef.current) {
              setMessages(mergeMessages([], event.messages))
              runsRef.current = mergeRuns([], event.runs)
              setRuns(runsRef.current)
              nextCursorRef.current = event.nextCursor
              setNextCursor(event.nextCursor)
              historyReadyRef.current = true
            } else {
              setMessages((current) => mergeMessages(current, event.messages))
              runsRef.current = mergeRuns(runsRef.current, event.runs)
              setRuns(runsRef.current)
            }
            setLatestStepByRun(
              new Map(event.latestSteps.map((s) => [s.runId, s])),
            )
            setLiveStepsByRun(
              new Map(event.latestSteps.map((step) => [step.runId, [step]])),
            )
            setLoading(false)
            if (
              event.room.latestOtherMessage &&
              document.visibilityState === 'visible'
            )
              markRoomSeen(event.room.id, event.room.latestOtherMessage)
            if (
              event.room.attentionCount > 0 &&
              document.visibilityState === 'visible'
            )
              void acknowledge(selectedRoomId)
          }
          if (
            event.type === 'message.created' &&
            event.message.roomId === selectedRoomId
          ) {
            setMessages((current) => mergeMessages(current, [event.message]))
            recordMessageActivity({
              roomId: event.message.roomId,
              messageId: event.message.id,
              createdAt: event.message.createdAt,
              authorId: event.message.author.id,
            })
          }
          if (
            event.type === 'run.changed' &&
            event.run.roomId === selectedRoomId
          ) {
            runsRef.current = mergeRuns(runsRef.current, [event.run])
            setRuns((current) => mergeRuns(current, [event.run]))
          }
          if (
            event.type === 'run.step' &&
            runsRef.current.some((r) => r.id === event.runId)
          ) {
            setLatestStepByRun((current) => {
              const next = new Map(current)
              next.set(event.runId, event.step)
              return next
            })
            setLiveStepsByRun((current) => {
              const next = new Map(current)
              next.set(
                event.runId,
                upsert(current.get(event.runId) ?? [], event.step),
              )
              return next
            })
          }
          if (event.type === 'room.members.changed') {
            setMembersChangedAt((current) => ({
              ...current,
              [event.roomId]: Date.now(),
            }))
          }
        },
        onClose() {
          if (stopped) return
          if (attempts++ >= 5) {
            setConnection('disconnected')
            setError('Coordinator unavailable')
            return
          }
          setConnection('reconnecting')
          retry = setTimeout(connect, Math.min(1_000 * 2 ** attempts, 10_000))
        },
        onError() {
          roomSocket.current?.close()
        },
      })
      roomSocket.current = handle
    }

    connect()
    return () => {
      stopped = true
      if (retry) clearTimeout(retry)
      roomSocket.current?.close()
    }
  }, [acknowledge, markRoomSeen, recordMessageActivity, selectedRoomId])

  const notificationByRoom = useMemo<Record<string, RoomNotification>>(
    () =>
      Object.fromEntries(
        rooms.flatMap((room) => {
          const notification = roomNotification(
            room.mentionCount,
            room.latestOtherMessage,
            seenRoomMessagesRef.current[room.id],
          )
          return notification ? [[room.id, notification]] : []
        }),
      ),
    [rooms, seenVersion],
  )

  const loadOlder = useCallback(async () => {
    const roomId = selectedRoomId
    const cursor = nextCursorRef.current
    if (!roomId || !cursor || loadingOlderRef.current) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const response = await apiFetch(
        `/api/rooms/${roomId}/messages?cursor=${encodeURIComponent(cursor)}`,
      )
      const page = (await response.json()) as RoomHistoryPage & {
        error?: string
      }
      if (!response.ok) throw new Error(page.error ?? 'Unable to load history')
      if (selectedRoomRef.current !== roomId) return
      setMessages((current) => mergeMessages(current, page.messages))
      runsRef.current = mergeRuns(runsRef.current, page.runs)
      setRuns((current) => mergeRuns(current, page.runs))
      nextCursorRef.current = page.nextCursor
      setNextCursor(page.nextCursor)
      setError(undefined)
    } catch (reason) {
      if (selectedRoomRef.current === roomId)
        setError(
          reason instanceof Error ? reason.message : 'Unable to load history',
        )
    } finally {
      loadingOlderRef.current = false
      setLoadingOlder(false)
    }
  }, [selectedRoomId])

  useEffect(() => {
    if (!selectedRoomId) return
    let stopped = false
    void apiFetch(`/api/rooms/${selectedRoomId}/mentionable-accounts`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load mentions')
        const result = (await response.json()) as {
          accounts: MentionableAccount[]
        }
        if (!stopped) setMentionableAccounts(result.accounts)
      })
      .catch(() => {
        if (!stopped) setMentionableAccounts([])
      })
    return () => {
      stopped = true
    }
  }, [membersChangedAt, selectedRoomId])

  useEffect(() => {
    const onVisible = () => {
      const roomId = selectedRoomRef.current
      if (document.visibilityState === 'visible' && roomId)
        void acknowledge(roomId)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [acknowledge])

  const request = async <T>(
    path: string,
    body?: unknown,
    method = 'POST',
  ): Promise<T | undefined> => {
    try {
      const response = await apiFetch(path, {
        method,
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
    mentionableAccounts,
    notificationByRoom,
    select: (roomId: string) => {
      if (roomId === selectedRoomId) return
      setSelectedRoomId(roomId)
      localStorage.setItem(selectedRoomKey, roomId)
      historyReadyRef.current = false
      nextCursorRef.current = undefined
      loadingOlderRef.current = false
      setMessages([])
      setRuns([])
      setNextCursor(undefined)
      setLoadingOlder(false)
      setLatestStepByRun(new Map())
      setLiveStepsByRun(new Map())
      setMentionableAccounts([])
      setLoading(true)
      setConnection('connecting')
    },
    draft: selectedRoomId ? (drafts.current[selectedRoomId] ?? '') : '',
    setDraft: (text: string) => {
      if (selectedRoomId) drafts.current[selectedRoomId] = text
    },
    create: async (
      name: string,
      visibility: 'public' | 'private' = 'public',
    ) => {
      try {
        const response = await apiFetch('/api/rooms', {
          method: 'POST',
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
        historyReadyRef.current = false
        nextCursorRef.current = undefined
        loadingOlderRef.current = false
        setMessages([])
        setRuns([])
        setNextCursor(undefined)
        setLoadingOlder(false)
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
    remove: async (roomId: string) => {
      const result = await request<{ ok: true }>(
        `/api/rooms/${roomId}`,
        undefined,
        'DELETE',
      )
      if (result) forgetRoom(roomId)
      return result
    },
    createError,
    send: async (text: string, files: File[] = []) => {
      if (!selectedRoomId) return
      let result: { message: RoomMessage; run?: RoomRun } | undefined
      try {
        const body = files.length
          ? (() => {
              const form = new FormData()
              form.set('text', text)
              files.forEach((file) => form.append('attachments', file))
              return form
            })()
          : JSON.stringify({ text })
        const response = await apiFetch(
          `/api/rooms/${selectedRoomId}/messages`,
          {
            method: 'POST',
            headers: files.length
              ? undefined
              : { 'content-type': 'application/json' },
            body,
          },
        )
        const responseBody = (await response.json()) as {
          message?: RoomMessage
          run?: RoomRun
          error?: string
        }
        if (!response.ok || !responseBody.message)
          throw new Error(responseBody.error ?? 'Request failed')
        result = { message: responseBody.message, run: responseBody.run }
        setError(undefined)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Request failed')
      }
      if (result) {
        setMessages((current) => mergeMessages(current, [result.message]))
        if (result.run) {
          runsRef.current = mergeRuns(runsRef.current, [result.run])
          setRuns((current) => mergeRuns(current, [result.run!]))
        }
      }
      return result
    },
    loadOlder,
    loadingOlder,
    hasOlderMessages: Boolean(nextCursor),
    cancel: (runId: string) =>
      selectedRoomId
        ? request(`/api/rooms/${selectedRoomId}/runs/${runId}/cancel`)
        : undefined,
  }
}
