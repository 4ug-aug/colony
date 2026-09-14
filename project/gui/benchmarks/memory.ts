// Real Happy DOM/React/TanStack room benchmark.
// Run: CHECK_MEMORY=1 bun run benchmark:memory
// Heap/RSS/external are report-only; CHECK_MEMORY asserts lifecycle invariants.
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import type { Window as HappyWindow } from 'happy-dom'

GlobalRegistrator.register({ width: 1440, height: 900 })
;(window as unknown as HappyWindow).happyDOM.setURL('http://localhost:3010/')

const { createElement, Profiler } = await import('react')
const { flushSync } = await import('react-dom')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { Timeline } = await import('../src/features/rooms/room-timeline')
const { RoomThreadRail } =
  await import('../src/features/rooms/room-thread-rail')
const { MessageComposer } =
  await import('../src/features/rooms/message-composer')
const { attachAttachmentCacheCleanup } =
  await import('../src/features/rooms/use-attachment-blob')
const { agentDefinitionsQueryKey } =
  await import('../src/features/agents/use-agent-definitions')
const { roomLiveStepsQueryKey } =
  await import('../src/features/rooms/room-live-steps')
const { useRoomLiveSteps } =
  await import('../src/features/rooms/room-live-steps')

type Scenario = {
  label: string
  room: number
  thread?: number
  images?: number
  liveSteps?: number
  lifecycle?: boolean
}
type Attachment = {
  id: string
  filename: string
  contentType: string
  byteSize: number
}
type Report = {
  scenario: Scenario
  heap: number
  rss: number
  external: number
  transcriptCommits: number
  composerCommits: number
  roomMessages: number
  roomButtons: number
  peakDomElements: number
  peakQueryRecords: number
  liveStepCount: number
  threadEditors: number
  threadQueriesAfterClose: number
  switchQueriesAfterClose: number
  liveQueriesAfterTeardown: number
  liveDataAfterTeardown: boolean
  emptyLiveStepKeys: number
  previewFetches: number
  offscreenPreviewFetches: number
  objectUrlsCreated: number
  objectUrlsRevoked: number
  listenersAdded: number
  listenersRemoved: number
  observersActive: number
}

const scenarios: Scenario[] = [
  { label: 'room 50', room: 50 },
  { label: 'room 250', room: 250 },
  { label: 'room 500', room: 500 },
  { label: 'room 50 + 10 thread', room: 50, thread: 10 },
  { label: 'room 50 + 50 thread', room: 50, thread: 50 },
  { label: 'room 50 + 250 thread', room: 50, thread: 250 },
  { label: 'room 50 + 1k live steps', room: 50, liveSteps: 1_000 },
  {
    label: 'room 50 + 50 images',
    room: 50,
    images: 50,
    lifecycle: true,
  },
  {
    label: 'room 50 + 50 thread + 10k live steps',
    room: 50,
    thread: 50,
    liveSteps: 10_000,
    images: 50,
    lifecycle: true,
  },
]
const noop = () => {}
const empty: never[] = []
const waitTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function assert(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(reason)
}

function message(
  id: string,
  createdAt: number,
  attachments: Attachment[] = [],
) {
  return {
    id,
    roomId: 'bench',
    author: { id: 'ada', name: 'Ada', kind: 'user' as const },
    text: `Room benchmark message ${id} with **markdown** and a reply target.`,
    createdAt,
    attachments,
  }
}

function step(index: number) {
  return {
    id: `step-${index}`,
    runId: 'run-1',
    idx: index,
    kind: 'tool_call' as const,
    tool: 'shell',
    text: `step ${index}`,
    createdAt: index,
  }
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  }
}

function installInstrumentation() {
  let previewFetches = 0
  let objectUrlsCreated = 0
  let objectUrlsRevoked = 0
  let listenersAdded = 0
  let listenersRemoved = 0
  let observersActive = 0
  const observerCallbacks = new Set<IntersectionObserverCallback>()

  const nativeMatchMedia = window.matchMedia.bind(window)
  window.matchMedia = ((query: string) => {
    const media = nativeMatchMedia(query)
    const add = media.addEventListener.bind(media)
    const remove = media.removeEventListener.bind(media)
    media.addEventListener = ((...args: Parameters<typeof add>) => {
      listenersAdded++
      return add(...args)
    }) as typeof media.addEventListener
    media.removeEventListener = ((...args: Parameters<typeof remove>) => {
      listenersRemoved++
      return remove(...args)
    }) as typeof media.removeEventListener
    return media
  })

  class BenchIntersectionObserver {
    private readonly callback: IntersectionObserverCallback

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      observersActive++
      observerCallbacks.add(callback)
    }
    observe() {}
    disconnect() {
      if (observerCallbacks.delete(this.callback)) observersActive--
    }
    unobserve() {}
    takeRecords() {
      return []
    }
    readonly root = null
    readonly rootMargin = '300px'
    readonly thresholds = [0]
  }
  globalThis.IntersectionObserver =
    BenchIntersectionObserver as unknown as typeof IntersectionObserver

  URL.createObjectURL = (() => {
    objectUrlsCreated++
    return `blob:benchmark-${objectUrlsCreated}`
  })
  URL.revokeObjectURL = (() => {
    objectUrlsRevoked++
  })

  window.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('/api/attachments/')) {
      previewFetches++
      return new Response(new Blob([new Uint8Array(100 * 1024)]), {
        status: 200,
      })
    }
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof window.fetch

  return {
    intersectAll() {
      for (const callback of observerCallbacks)
        callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        )
    },
    get previewFetches() {
      return previewFetches
    },
    get objectUrlsCreated() {
      return objectUrlsCreated
    },
    get objectUrlsRevoked() {
      return objectUrlsRevoked
    },
    get listenersAdded() {
      return listenersAdded
    },
    get listenersRemoved() {
      return listenersRemoved
    },
    get observersActive() {
      return observersActive
    },
  }
}

function seedClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(agentDefinitionsQueryKey, [])
  attachAttachmentCacheCleanup(client)
  return client
}

async function runScenario(scenario: Scenario): Promise<Report> {
  const instrumentation = installInstrumentation()
  const client = seedClient()
  const attachments = Array.from({ length: scenario.images ?? 0 }, (_, index) => ({
    id: `image-${index}`,
    filename: `image-${index}.png`,
    contentType: 'image/png',
    byteSize: 100 * 1024,
  }))
  const messages = Array.from({ length: scenario.room }, (_, index) =>
    message(
      `message-${index}`,
      index,
      attachments.length ? [attachments[index % attachments.length]] : [],
    ),
  )
  const threadRoot = message('root', 0)
  const replies = Array.from({ length: scenario.thread ?? 0 }, (_, index) =>
    message(`reply-${index}`, index + 1),
  )
  const results = (scenario.thread ? replies : []).map((reply, index) => ({
    id: `result-${index}`,
    agentId: 'agent',
    text: `Result ${reply.id}`,
    createdAt: index + 1,
  }))
  if (scenario.thread)
    client.setQueryData(['room-thread', 'bench', 'root'], {
      root: threadRoot,
      replies,
      results,
    })

  const roomHost = document.createElement('div')
  document.body.append(roomHost)
  const roomRoot = createRoot(roomHost)
  let transcriptCommits = 0
  let composerCommits = 0
  const timeline = createElement(Timeline, {
    messages,
    runs: empty,
    openRun: noop,
    mentionHandles: empty,
    currentUserId: 'ada',
    onEdit: noop,
    onOpenThread: noop,
  })
  const composer = createElement(MessageComposer, {
    value: '',
    onChange: noop,
    onSubmit: async () => true,
    disabled: false,
    roomName: 'Benchmark',
    mentionableAccounts: empty,
    hideMentions: true,
  })
  flushSync(() => {
    roomRoot.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          'div',
          null,
          createElement(
            Profiler,
            { id: 'timeline', onRender: () => transcriptCommits++ },
            timeline,
          ),
          createElement(
            Profiler,
            { id: 'composer', onRender: () => composerCommits++ },
            composer,
          ),
        ),
      ),
    )
  })
  transcriptCommits = 0
  composerCommits = 0
  const liveStepCount = scenario.liveSteps ?? 0
  if (liveStepCount)
    client.setQueryData(roomLiveStepsQueryKey('bench'), {
      latestStepByRun: new Map([['run-1', step(liveStepCount - 1)]]),
      liveStepsByRun: new Map([
        [
          'run-1',
          Array.from({ length: liveStepCount }, (_, index) => step(index)),
        ],
      ]),
    })
  await waitTurn()
  const burstTranscriptCommits = transcriptCommits
  const burstComposerCommits = composerCommits
  transcriptCommits = 0
  composerCommits = 0
  let roomMessages = document.body.querySelectorAll('[data-message-id]').length
  let roomButtons = document.body.querySelectorAll('button').length
  const offscreenPreviewFetches = instrumentation.previewFetches
  instrumentation.intersectAll()
  await waitTurn()
  await waitTurn()
  let peakDomElements = document.body.querySelectorAll('*').length
  let peakQueryRecords = client.getQueryCache().getAll().length
  const peakImageFetches = instrumentation.previewFetches
  let mountedMemory = process.memoryUsage()

  const threadHost = document.createElement('div')
  const threadRootRenderer = createRoot(threadHost)
  let threadEditors = 0
  let threadQueriesAfterClose = 0
  let closedThreadEditors = 0
  if (scenario.thread) {
    document.body.append(threadHost)
    const renderThread = (rootId: string) =>
      flushSync(() => {
        threadRootRenderer.render(
          createElement(
            QueryClientProvider,
            { client },
            createElement(RoomThreadRail, {
              roomId: 'bench',
              roomName: 'Benchmark',
              rootId,
              liveReplies: empty,
              mentionHandles: empty,
              mentionableAccounts: empty,
              draftText: '',
              onDraftChange: noop,
              onDraftSubmitted: noop,
              sendReply: async () => undefined,
              editMessage: async () => undefined,
            }),
          ),
        )
      })
    renderThread('root')
    threadEditors = threadHost.querySelectorAll(
      '[contenteditable="true"]',
    ).length
    roomMessages = document.body.querySelectorAll('[data-message-id]').length
    roomButtons = document.body.querySelectorAll('button').length
    peakDomElements = document.body.querySelectorAll('*').length
    peakQueryRecords = client.getQueryCache().getAll().length
    mountedMemory = process.memoryUsage()
    if (scenario.lifecycle)
      for (let cycle = 0; cycle < 20; cycle++) {
        client.setQueryData(['room-thread', 'bench', `cycle-${cycle}`], {
          root: threadRoot,
          replies,
          results,
        })
        renderThread(`cycle-${cycle}`)
        flushSync(() => threadRootRenderer.render(null))
        await waitTurn()
      }
    else {
      flushSync(() => threadRootRenderer.render(null))
      await waitTurn()
    }
    threadQueriesAfterClose = client
      .getQueryCache()
      .findAll({ queryKey: ['room-thread'] }).length
    closedThreadEditors = threadHost.querySelectorAll(
      '[contenteditable="true"]',
    ).length
    threadRootRenderer.unmount()
    threadHost.remove()
  }

  flushSync(() => roomRoot.unmount())
  roomHost.remove()
  client.removeQueries({
    queryKey: roomLiveStepsQueryKey('bench'),
    exact: true,
  })
  if (scenario.lifecycle) {
    const switchHost = document.createElement('div')
    document.body.append(switchHost)
    const switchRoot = createRoot(switchHost)
    const RoomCacheProbe = ({ roomId }: { roomId: string }) => {
      useRoomLiveSteps(roomId)
      return null
    }
    for (let cycle = 0; cycle < 20; cycle++)
      flushSync(() =>
        switchRoot.render(
          createElement(
            QueryClientProvider,
            { client },
            createElement(RoomCacheProbe, {
              roomId: `render-switch-${cycle}`,
            }),
          ),
        ),
      )
    flushSync(() => switchRoot.unmount())
    switchHost.remove()
    await waitTurn()
  }
  const switchQueriesAfterClose = client
    .getQueryCache()
    .findAll({ queryKey: ['room-live-steps'] }).length

  const report: Report = {
    scenario,
    heap: mountedMemory.heapUsed,
    rss: mountedMemory.rss,
    external: mountedMemory.external,
    transcriptCommits: burstTranscriptCommits,
    composerCommits: burstComposerCommits,
    roomMessages,
    roomButtons,
    peakDomElements,
    peakQueryRecords,
    liveStepCount,
    threadEditors,
    threadQueriesAfterClose,
    switchQueriesAfterClose,
    liveQueriesAfterTeardown: client
      .getQueryCache()
      .findAll({ queryKey: ['room-live-steps'] }).length,
    liveDataAfterTeardown:
      client.getQueryData(roomLiveStepsQueryKey('bench')) !== undefined,
    emptyLiveStepKeys: client
      .getQueryCache()
      .findAll({ queryKey: roomLiveStepsQueryKey('') }).length,
    previewFetches: peakImageFetches,
    offscreenPreviewFetches,
    objectUrlsCreated: instrumentation.objectUrlsCreated,
    objectUrlsRevoked: instrumentation.objectUrlsRevoked,
    listenersAdded: instrumentation.listenersAdded,
    listenersRemoved: instrumentation.listenersRemoved,
    observersActive: instrumentation.observersActive,
  }
  assert(closedThreadEditors === 0, 'closed thread left editor DOM')
  client.clear()
  return report
}

if (process.argv.includes('--child')) {
  const scenario = scenarios[Number(process.argv.at(-1))]
  assert(scenario, 'unknown memory benchmark scenario')
  console.log(JSON.stringify(await runScenario(scenario)))
  process.exit(0)
} else {
  const rows: Report[] = []
  for (let index = 0; index < scenarios.length; index++) {
    const samples: Report[] = []
    for (let sample = 0; sample < 3; sample++) {
      const child = Bun.spawn(
        [process.execPath, import.meta.path, '--child', String(index)],
        { stdout: 'pipe', stderr: 'inherit' },
      )
      const output = await new Response(child.stdout).text()
      const exitCode = await child.exited
      if (exitCode !== 0)
        throw new Error(
          `memory benchmark child ${index} failed (${exitCode}): ${output}`,
        )
      samples.push(JSON.parse(output) as Report)
    }
    rows.push(samples[1])
    const scenario = scenarios[index]
    console.log(
      scenario.label,
      {
        heap: stats(samples.map((row) => row.heap)),
        rss: stats(samples.map((row) => row.rss)),
        external: stats(samples.map((row) => row.external)),
      },
    )
    if (process.env.CHECK_MEMORY === '1') {
      for (const row of samples) {
        assert(
          row.transcriptCommits === 0,
          'step burst committed the transcript',
        )
        assert(row.composerCommits === 0, 'step burst committed the composer')
        assert(
          row.threadQueriesAfterClose === 0,
          'closed thread query retained',
        )
        assert(
          row.threadEditors === (row.scenario.thread ? 1 : 0),
          'thread editor count drifted',
        )
        assert(row.switchQueriesAfterClose === 0, 'room switch query retained')
        assert(
          row.liveQueriesAfterTeardown === 0,
          'room live-step query retained',
        )
        assert(!row.liveDataAfterTeardown, 'room live-step data retained')
        assert(
          row.emptyLiveStepKeys === 0,
          'disabled empty live-step key retained',
        )
        assert(
          row.offscreenPreviewFetches === 0,
          'offscreen image preview fetched',
        )
        assert(
          row.previewFetches === (row.scenario.images ?? 0),
          'image preview count did not match the scenario',
        )
        assert(
          row.liveStepCount === (row.scenario.liveSteps ?? 0),
          'wrong live-step count',
        )
        assert(
          row.objectUrlsCreated === row.objectUrlsRevoked,
          'object URLs did not balance',
        )
        assert(
          row.listenersAdded === row.listenersRemoved,
          'media listeners did not balance',
        )
        assert(
          row.observersActive === 0,
          'intersection observers did not balance',
        )
      }
    }
  }
  console.log('deterministic counts')
  console.table(
    rows.map((row) => ({
      scenario: row.scenario.label,
      room: row.scenario.room,
      thread: row.scenario.thread ?? 0,
      images: row.scenario.images ?? 0,
      stepBurst: row.scenario.liveSteps ?? 0,
      messages: row.roomMessages,
      dom: row.peakDomElements,
      buttons: row.roomButtons,
      queries: row.peakQueryRecords,
      liveSteps: row.liveStepCount,
      editors: row.threadEditors,
      objectUrls: `${row.objectUrlsCreated}/${row.objectUrlsRevoked}`,
      listeners: `${row.listenersAdded}/${row.listenersRemoved}`,
      previews: `${row.offscreenPreviewFetches}/${row.previewFetches}`,
    })),
  )
}
