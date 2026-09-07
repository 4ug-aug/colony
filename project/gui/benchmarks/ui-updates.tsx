// NODE_ENV=development CHECK_UI=1 CHECK_MEDIA=1 bun run benchmarks/ui-updates.tsx
// Actual components in Happy DOM: CPU/React work, not browser paint or FPS.
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import type { Window } from 'happy-dom'
import type { Step } from '../src/features/runs/step-label'

GlobalRegistrator.register({ width: 1440, height: 900 })
let mediaSubscriptions = 0
let mediaUnsubscriptions = 0
const matchMedia = window.matchMedia.bind(window)
window.matchMedia = (query) => {
  const media = matchMedia(query)
  const add = media.addEventListener.bind(media)
  media.addEventListener = (...args: Parameters<typeof add>) => {
    mediaSubscriptions++
    return add(...args)
  }
  const remove = media.removeEventListener.bind(media)
  media.removeEventListener = (...args: Parameters<typeof remove>) => {
    mediaUnsubscriptions++
    return remove(...args)
  }
  return media
}
const { flushSync } = await import('react-dom')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { Timeline } = await import('../src/features/rooms/room-timeline')
const { ToolCallDetailsList } =
  await import('../src/features/runs/tool-call-details-list')
const { pairSteps } = await import('../src/features/runs/run-activity')
const { agentDefinitionsQueryKey } =
  await import('../src/features/agents/use-agent-definitions')
const noop = () => {}
const empty: never[] = []
const messages = Array.from({ length: 100 }, (_, i) => ({
  id: `message-${i}`,
  roomId: 'bench',
  author: { id: `person-${i % 2}`, name: `Person ${i % 2}` },
  text: `Message **${i}** with a short update.`,
  createdAt: 1700000000000 + i * 60000,
  attachments: [],
}))
const payload = JSON.stringify({
  benchmarkPayload: true,
  rows: Array.from({ length: 150 }, (_, i) => ({
    path: `src/file-${i}.ts`,
    text: 'A useful tool result with enough detail to inspect.'.repeat(3),
  })),
})
const steps: Step[] = Array.from({ length: 40 }, (_, i) => [
  {
    id: `call-${i}`,
    runId: 'bench',
    idx: i * 2,
    kind: 'tool_call' as const,
    tool: 'shell',
    callId: `c-${i}`,
    text: '{"command":"rg TODO src"}',
    createdAt: 1700000000000 + i,
  },
  {
    id: `result-${i}`,
    runId: 'bench',
    idx: i * 2 + 1,
    kind: 'tool_result' as const,
    callId: `c-${i}`,
    text: payload,
    createdAt: 1700000000000 + i,
  },
]).flat()
let payloadParses = 0
const parse = JSON.parse
JSON.parse = ((text, reviver) => {
  if (typeof text === 'string' && text.includes('benchmarkPayload'))
    payloadParses++
  return parse(text, reviver)
}) as typeof JSON.parse
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
function sample(kind: 'timeline' | 'tools') {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(agentDefinitionsQueryKey, [])
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let currentMessages = messages
  let currentSteps = steps
  let resultMaxLength: number | undefined
  const render = () =>
    flushSync(() =>
      root.render(
        <QueryClientProvider client={client}>
          {kind === 'timeline' ? (
            <Timeline
              messages={currentMessages}
              runs={empty}
              mentionHandles={empty}
              openRun={noop}
              onOpenThread={() => {}}
              onEdit={() => {}}
            />
          ) : (
            <ToolCallDetailsList
              items={pairSteps(currentSteps)}
              compact={resultMaxLength !== undefined}
              resultMaxLength={resultMaxLength}
            />
          )}
        </QueryClientProvider>,
      ),
    )
  payloadParses = 0
  const start = performance.now()
  render()
  const mountMs = performance.now() - start
  const mountParses = payloadParses
  for (let i = 0; i < 5; i++) render()
  payloadParses = 0
  mediaSubscriptions = 0
  const times = []
  for (let i = 0; i < 20; i++) {
    // New wrappers from pairSteps and a real appended step, as on streamed activity.
    if (kind === 'tools')
      currentSteps = [
        ...currentSteps,
        {
          id: `live-${i}`,
          runId: 'bench',
          idx: 80 + i,
          kind: 'tool_call',
          tool: 'shell',
          text: '{}',
          createdAt: 1700000001000 + i,
        },
      ]
    const t = performance.now()
    render()
    times.push(performance.now() - t)
  }
  const updateParses = payloadParses
  const updateSubscriptions = mediaSubscriptions
  if (kind === 'timeline') {
    if (process.env.CHECK_MEDIA === '1')
      assert(updateSubscriptions === 0, 'unchanged media queries resubscribed')
    assert(
      host.querySelectorAll('[data-message-id]').length === 100,
      'missing timeline messages',
    )
    currentMessages = messages.map((m, i) =>
      i === 0 ? { ...m, text: 'Changed message' } : m,
    )
    render()
    assert(
      host
        .querySelector('[data-message-id="message-0"]')
        ?.textContent.includes('Changed message'),
      'edit did not render',
    )
  } else {
    assert(
      host.querySelectorAll('button').length === 60,
      'missing appended tool calls',
    )
    if (process.env.CHECK_UI === '1')
      assert(
        mountParses === 0 && updateParses === 0,
        'collapsed results were parsed',
      )
    flushSync(() => host.querySelector('button')!.click())
    assert(
      host.textContent.includes('src/file-0.ts'),
      'expanded result missing',
    )
    const changed = JSON.stringify({
      benchmarkPayload: true,
      text: 'Updated visible result',
    })
    currentSteps = currentSteps.map((step) =>
      step.id === 'result-0' ? { ...step, text: changed } : step,
    )
    render()
    assert(
      host.textContent.includes('Updated visible result'),
      'open result did not update',
    )
    resultMaxLength = 10
    render()
    assert(
      host.querySelectorAll('pre')[1].textContent ===
        JSON.stringify(JSON.parse(changed), null, 2).slice(0, 10),
      'compact result limit did not update',
    )
    currentSteps = [
      ...currentSteps,
      {
        id: 'failed-result',
        runId: 'bench',
        idx: 101,
        kind: 'tool_result',
        callId: 'pending',
        text: "Tool 'missing' not found.",
        createdAt: 1700000002000,
      },
    ]
    currentSteps = currentSteps.map((step) =>
      step.id === 'live-0' ? { ...step, callId: 'pending' } : step,
    )
    render()
    assert(
      host.querySelector('button[aria-label="shell, Failed"]'),
      'failed result status did not update',
    )
  }
  times.sort((a, b) => a - b)
  flushSync(() => root.unmount())
  host.remove()
  client.clear()
  return {
    kind,
    mountMs: +mountMs.toFixed(2),
    medianMs: +times[10].toFixed(2),
    p95Ms: +times[18].toFixed(2),
    mountParses,
    updateParses,
    updateSubscriptions,
  }
}
console.log(
  `100 messages; 40 completed tools with ${payload.length}-byte results; 20 updates per pass`,
)
for (let pass = 0; pass < 3; pass++) {
  console.log(`Pass ${pass + 1}`)
  console.table([sample('timeline'), sample('tools')])
}
JSON.parse = parse
const { useMediaQuery } = await import('../src/hooks/use-media-query')
function MediaProbe({ query }: { query: string }) {
  return <output>{String(useMediaQuery(query))}</output>
}
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
mediaSubscriptions = 0
mediaUnsubscriptions = 0
const resize = (width: number) =>
  flushSync(() => (window as unknown as Window).happyDOM.setViewport({ width }))
flushSync(() => root.render(<MediaProbe query="(min-width: 1024px)" />))
assert(host.textContent === 'true', 'initial media query mismatch')
// Happy DOM initializes its change-listener cache to false; prime the true state.
resize(1441)
resize(800)
assert(
  String(host.textContent) === 'false',
  'media query did not update after resize',
)
flushSync(() => root.render(<MediaProbe query="(min-width: 600px)" />))
assert(String(host.textContent) === 'true', 'changed query did not update')
resize(801)
resize(500)
assert(
  String(host.textContent) === 'false',
  'changed query lost its subscription',
)
flushSync(() => root.unmount())
assert(
  mediaSubscriptions === mediaUnsubscriptions,
  'media listener leaked after unmount',
)
host.remove()
console.log(
  'Checks passed: edits, expansion, live results, compact limits, failure status, resize, query changes, listener cleanup.',
)
process.exit(0)
