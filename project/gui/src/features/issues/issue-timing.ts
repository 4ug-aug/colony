export type IssueTimingSession = {
  issueId: string
  startedAt: number
}

const STORAGE_KEY = 'sweat.issue-timing'

const listeners = new Set<() => void>()

/** Cached so useSyncExternalStore getSnapshot stays referentially stable. */
let cachedRaw: string | null | undefined
let cachedSession: IssueTimingSession | null = null

function notify() {
  for (const listener of listeners) listener()
}

function parseSession(raw: string | null): IssueTimingSession | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<IssueTimingSession>
    if (
      typeof parsed.issueId !== 'string' ||
      parsed.issueId.length === 0 ||
      typeof parsed.startedAt !== 'number' ||
      !Number.isFinite(parsed.startedAt)
    ) {
      return null
    }
    return { issueId: parsed.issueId, startedAt: parsed.startedAt }
  } catch {
    return null
  }
}

export function getIssueTimingSession(): IssueTimingSession | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === cachedRaw) return cachedSession
  cachedRaw = raw
  cachedSession = parseSession(raw)
  return cachedSession
}

export function setIssueTimingSession(session: IssueTimingSession | null) {
  if (typeof localStorage === 'undefined') return
  if (session) {
    const raw = JSON.stringify(session)
    localStorage.setItem(STORAGE_KEY, raw)
    cachedRaw = raw
    cachedSession = session
  } else {
    localStorage.removeItem(STORAGE_KEY)
    cachedRaw = null
    cachedSession = null
  }
  notify()
}

export function startIssueTimingSession(issueId: string): IssueTimingSession {
  const session = { issueId, startedAt: Date.now() }
  setIssueTimingSession(session)
  return session
}

export function clearIssueTimingSession() {
  setIssueTimingSession(null)
}

export function subscribeIssueTiming(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      // Another tab may have written; drop cache so getSnapshot re-reads.
      cachedRaw = undefined
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function elapsedMs(startedAt: number, now = Date.now()): number {
  return Math.max(0, now - startedAt)
}

export function elapsedMinutes(startedAt: number, now = Date.now()): number {
  return Math.round(elapsedMs(startedAt, now) / 60_000)
}

export function formatElapsedClock(startedAt: number, now = Date.now()): string {
  const totalSeconds = Math.floor(elapsedMs(startedAt, now) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${hours}:${mm}:${ss}`
  return `${mm}:${ss}`
}
