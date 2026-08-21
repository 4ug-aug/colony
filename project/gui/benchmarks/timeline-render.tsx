// Measures what a Dashboard re-render costs the room timeline. Every streamed
// agent step commits state at the top of the tree (use-rooms), and every commit
// re-runs `Markdown`, whose react-markdown pipeline re-parses the message from
// scratch. `mount` is the unavoidable first parse; `perCommit` is the cost this
// benchmark exists to drive to zero.
//
// The three scenarios are the three shapes the real call sites take, because
// memo() only bails out when every prop is referentially stable:
//   inline   - room-view.tsx builds `mentions` as a fresh array literal
//   memoized - the same array lifted into useMemo
//   none     - no `mentions` prop at all (16 of the 20 call sites)
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()
// Nothing should reach the network; the agent list is seeded into the cache.
globalThis.fetch = (() =>
  Promise.reject(new Error('benchmark is offline'))) as unknown as typeof fetch

const { useMemo, useState } = await import('react')
const { flushSync } = await import('react-dom')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } = await import(
  '@tanstack/react-query'
)
const { Markdown } = await import('#/components/markdown')
const { agentDefinitionsQueryKey } = await import(
  '#/features/agents/use-agent-definitions'
)
const { mergeLatestSteps, mergeLiveSteps } = await import(
  '#/features/rooms/room-step-batch'
)
type StepArrival = import('#/features/rooms/room-step-batch').StepArrival
type Step = import('#/features/runs/step-label').Step

const messageCount = 100
const commitsPerSample = 15
const samples = 5
const modes = ['inline', 'memoized', 'none'] as const

type Mode = (typeof modes)[number]
type Timings = { mount: number; burst: number; perCommit: number }

const agents = [
  { id: 'software-engineer', name: 'Software Engineer' },
  { id: 'antboy', name: 'Antboy' },
]
const accounts = [{ username: 'ada' }, { username: 'grace' }]
const userName = 'august'

const bodies = [
  'Shipped the `retry` guard on **oneshot** runs. @software-engineer can you confirm the coordinator picks it up?',
  'Three things:\n\n- the stream reconnects\n- steps arrive in order\n- the rail scrolls to the bottom\n\nSee [the ADR](https://example.com/adr/21) for the reasoning.',
  'Repro:\n\n```ts\nconst run = await start({ task })\nexpect(run.state).toBe("preparing")\n```\n\nFails on the second call only.',
  '## Status\n\nMigration is done. @antboy picked up the follow-up. Remaining risk is the `room_message_fts` rebuild on large rooms.',
  'Not reproducible here — `bun test` is green across all 99 files. Might be the WKWebView layout path rather than our code.',
]

const texts = Array.from(
  { length: messageCount },
  (_, index) => `${bodies[index % bodies.length]}\n\n(message ${index + 1})`,
)

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function Bench({
  mode,
  bump,
}: {
  mode: Mode
  bump: { current: () => void }
}) {
  const [tick, setTick] = useState(0)
  bump.current = () => setTick((value) => value + 1)
  // Rebuilt every commit, exactly as room-view.tsx does today.
  const inline = [userName, ...accounts.map((account) => account.username)]
  const memoized = useMemo(
    () => [userName, ...accounts.map((account) => account.username)],
    [],
  )
  return (
    <div data-tick={tick}>
      {texts.map((text, index) =>
        mode === 'none' ? (
          <Markdown key={index}>{text}</Markdown>
        ) : (
          <Markdown
            key={index}
            mentions={mode === 'inline' ? inline : memoized}
          >
            {text}
          </Markdown>
        ),
      )}
    </div>
  )
}

function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(agentDefinitionsQueryKey, agents)
  return client
}

function sample(mode: Mode): Timings {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const bump = { current: () => {} }

  const mountStart = performance.now()
  flushSync(() => {
    root.render(
      <QueryClientProvider client={seededClient()}>
        <Bench mode={mode} bump={bump} />
      </QueryClientProvider>,
    )
  })
  const mount = performance.now() - mountStart

  // flushSync forces one synchronous commit per iteration, which is what a
  // single streamed step costs today. No React scheduler, no act(): happy-dom
  // never drains React's MessageChannel, so act() would hang.
  const burstStart = performance.now()
  for (let index = 0; index < commitsPerSample; index++)
    flushSync(() => {
      bump.current()
    })
  const burst = performance.now() - burstStart

  assert(
    host.textContent.includes('Shipped the retry guard'),
    'markdown did not render',
  )
  assert(
    host.querySelectorAll('pre').length >= messageCount / bodies.length,
    'code blocks did not render',
  )
  assert(
    host.querySelector('[data-tick]')?.getAttribute('data-tick') ===
      String(commitsPerSample),
    'parent did not commit every update',
  )

  flushSync(() => {
    root.unmount()
  })
  host.remove()
  return { mount, burst, perCommit: burst / commitsPerSample }
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted[middle]
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]
  return { median: `${median.toFixed(2)} ms`, p95: `${p95.toFixed(2)} ms` }
}

const results = new Map<Mode, Timings[]>()
for (const mode of modes) {
  sample(mode) // warm up JIT and the remark pipeline
  const runs: Timings[] = []
  for (let index = 0; index < samples; index++) runs.push(sample(mode))
  results.set(mode, runs)
}

console.log(
  `Timeline: ${messageCount} messages, ${commitsPerSample} parent commits per sample, ${samples} samples`,
)
for (const [label, key] of [
  ['Mount (first parse)', 'mount'],
  [`Burst of ${commitsPerSample} commits`, 'burst'],
  ['Per commit', 'perCommit'],
] as const) {
  console.log(`\n${label}`)
  console.table(
    Object.fromEntries(
      modes.map((mode) => [
        mode,
        stats(results.get(mode)!.map((run) => run[key])),
      ]),
    ),
  )
}


// ---- Fix 2: commits caused by a burst of streamed steps ----
// Replays the coalescing that use-rooms now does, over the real merge helpers,
// and counts how many commits a burst produces. The old code committed once per
// arrival, so `arrivals` is the before number by construction.
const burstArrivals = 40
const arrivalsPerFrame = 8

function stepAt(index: number): Step {
  return {
    id: `step-${index}`,
    runId: 'run-1',
    idx: index,
    kind: 'tool_call',
    tool: 'shell',
    text: `step ${index}`,
    createdAt: index,
  }
}

const commits = await new Promise<number>((resolve) => {
  let pending: StepArrival[] = []
  let frame: number | undefined
  let flushes = 0
  let latest = new Map<string, Step>()
  let live = new Map<string, Step[]>()
  let sent = 0

  const flush = () => {
    frame = undefined
    if (!pending.length) return
    const batch = pending
    pending = []
    latest = mergeLatestSteps(latest, batch)
    live = mergeLiveSteps(live, batch)
    flushes++
  }

  const pump = () => {
    for (let index = 0; index < arrivalsPerFrame && sent < burstArrivals; index++)
      {
        pending.push({ runId: 'run-1', step: stepAt(sent++) })
        if (frame === undefined) frame = requestAnimationFrame(flush)
      }
    if (sent < burstArrivals) {
      requestAnimationFrame(pump)
      return
    }
    requestAnimationFrame(() => {
      flush()
      assert(live.get('run-1')?.length === burstArrivals, 'lost a step')
      assert(latest.get('run-1')?.id === `step-${burstArrivals - 1}`, 'wrong latest')
      resolve(flushes)
    })
  }
  pump()
})

console.log(
  `\nBurst of ${burstArrivals} steps (${arrivalsPerFrame} per frame): ${burstArrivals} commits before, ${commits} after`,
)
