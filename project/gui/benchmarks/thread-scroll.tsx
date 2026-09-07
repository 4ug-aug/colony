// Offline React/DOM benchmark of the actual Thread rail (no browser layout/paint).
// Run: NODE_ENV=development CHECK_SCROLL=1 bun run benchmarks/thread-scroll.tsx
// Timers are replayed every five scroll updates (~80 ms at 60 Hz); CSS paint is not measured.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register({ width: 1440, height: 900 })
let requests = 0
globalThis.fetch = (() => {
  requests++
  return Promise.reject(new Error('offline benchmark'))
}) as unknown as typeof fetch
const intervals = new Map<number, () => void>()
let intervalId = 0
window.setInterval = ((callback: () => void) => {
  intervals.set(++intervalId, callback)
  return intervalId
}) as typeof window.setInterval
window.clearInterval = (id) => {
  intervals.delete(Number(id))
}
const { AgentThinking } = await import('../src/components/ui/agent-thinking')
const { Profiler } = await import('react')
const { flushSync } = await import('react-dom')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { RoomThreadRail } =
  await import('../src/features/rooms/room-thread-rail')
const { agentDefinitionsQueryKey } =
  await import('../src/features/agents/use-agent-definitions')
const body =
  '## Update\n\nCompleted the **implementation** and checked `scrollTop`.\n\n- First check passed\n- Second check passed\n\n```ts\nconst ready = true\n```\n\n'.repeat(
    5,
  )
const noop = () => {}
const empty: never[] = []
function sample(count: number, results: boolean, thinking = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(agentDefinitionsQueryKey, [])
  const message = (id: string) => ({
    id,
    roomId: 'bench',
    author: { id: 'ada', name: 'Ada' },
    text: body,
    createdAt: 1,
    attachments: [],
  })
  client.setQueryData(['room-thread', 'bench', 'root'], {
    root: message('root'),
    replies: results
      ? []
      : Array.from({ length: count }, (_, i) => message(`reply-${i}`)),
    results: results
      ? Array.from({ length: count }, (_, i) => ({
          id: `result-${i}`,
          agentId: 'agent',
          text: body,
          createdAt: i + 2,
        }))
      : [],
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let commits = 0
  let liveReplies: ReturnType<typeof message>[] = []
  const render = () =>
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          <Profiler
            id="rail"
            onRender={(_, phase) => {
              if (phase !== 'mount') {
                commits++
              }
            }}
          >
            {thinking && <AgentThinking />}
            <RoomThreadRail
              roomId="bench"
              roomName="Benchmark"
              rootId="root"
              liveReplies={liveReplies}
              mentionHandles={empty}
              mentionableAccounts={empty}
              draftText=""
              onDraftChange={noop}
              onDraftSubmitted={noop}
              sendReply={async () => undefined}
              editMessage={async () => undefined}
            />
          </Profiler>
        </QueryClientProvider>,
      ),
    )
  render()
  const el = host.querySelector<HTMLDivElement>('.room-thread-timeline')
  if (!el) throw new Error('rail missing')
  Object.defineProperties(el, {
    scrollHeight: { configurable: true, value: 4000 },
    clientHeight: { configurable: true, value: 600 },
  })
  // Warm up; remain well away from the bottom so no logical state changes.
  // Invoke React's actual registered handler: Happy DOM does not deliver its scroll listener.
  const propsKey = Object.keys(el).find((key) =>
    key.startsWith('__reactProps$'),
  )!
  const scroll = (top: number) =>
    flushSync(() => {
      el.scrollTop = top
      ;(el as unknown as Record<string, { onScroll: () => void }>)[
        propsKey
      ].onScroll()
    })
  for (let i = 0; i < 10; i++) scroll(100 + i)
  commits = 0
  requests = 0
  const times: number[] = []
  for (let i = 0; i < 60; i++) {
    const start = performance.now()
    scroll(200 + i * 10)
    if (i % 5 === 0)
      flushSync(() => {
        for (const tick of intervals.values()) tick()
      })
    times.push(performance.now() - start)
  }
  const network = requests
  const steadyCommits = commits
  if (process.env.CHECK_SCROLL === '1' && steadyCommits !== 0)
    throw new Error(
      `Expected zero steady scroll commits, received ${steadyCommits}; verify event delivery or update baseline after optimization`,
    )
  // Cross into the 150px near-bottom zone without any new replies.
  scroll(3200)
  scroll(3260)
  const actualTop = el.scrollTop
  if (process.env.CHECK_SCROLL === '1' && actualTop !== 3260)
    throw new Error('scrolling near bottom jumped without new content')
  if (process.env.CHECK_SCROLL === '1') {
    const hasBanner = () =>
      [...host.querySelectorAll('button')].some((button) =>
        button.textContent.includes('new reply'),
      )
    scroll(200)
    liveReplies = [message('incoming-1')]
    render()
    if (el.scrollTop !== 200 || !hasBanner())
      throw new Error('incoming reply must preserve position and show banner')
    scroll(3260)
    if (hasBanner() || Number(el.scrollTop) !== 3260)
      throw new Error('near-bottom scroll must clear banner without jumping')
    liveReplies = [...liveReplies, message('incoming-2')]
    render()
    if (el.scrollTop !== el.scrollHeight)
      throw new Error('new reply must follow when near bottom')
  }
  const sorted = times.sort((a, b) => a - b)
  const output = {
    count,
    thinking,
    timers: intervals.size,
    kind: results ? 'run results' : 'messages',
    commits: steadyCommits,
    medianMs: +sorted[30].toFixed(2),
    p95Ms: +sorted[56].toFixed(2),
    maxMs: +sorted[59].toFixed(2),
    over16ms: times.filter((t) => t > 16.67).length,
    network,
    requestedTop: 3260,
    actualTop,
  }
  flushSync(() => root.unmount())
  host.remove()
  client.clear()
  return output
}
for (let pass = 0; pass < 3; pass++) {
  console.log(
    `Pass ${pass + 1}: 60 scroll events per scenario; ${body.length}-character Markdown bodies`,
  )
  console.table([
    sample(3, false),
    sample(3, true),
    sample(10, false),
    sample(10, true),
    sample(5, true, true),
  ])
}
process.exit(0)
