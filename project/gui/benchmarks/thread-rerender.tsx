// Offline React/DOM benchmark: an open Thread rail while the Room around it
// re-renders (run.changed events, main-composer typing). Dashboard hands the
// rail fresh callbacks and a fresh `[]` each time; unchanged thread rows must
// not re-render.
// Run: NODE_ENV=development CHECK_RERENDER=1 bun run benchmarks/thread-rerender.tsx
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import type { RoomMessage, RoomRun } from '../src/features/rooms/types'

GlobalRegistrator.register({ width: 1440, height: 900 })
globalThis.fetch = (() =>
  Promise.reject(new Error('offline benchmark'))) as unknown as typeof fetch
// Every RoomMessageRow render formats its timestamp exactly once.
let rowRenders = 0
const formatGetter = Object.getOwnPropertyDescriptor(
  Intl.DateTimeFormat.prototype,
  'format',
)!.get!
Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
  get() {
    const format = formatGetter.call(this) as (value?: number) => string
    return (value?: number) => {
      rowRenders++
      return format(value)
    }
  },
})
const { flushSync } = await import('react-dom')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { RoomThreadRail } =
  await import('../src/features/rooms/room-thread-rail')
const { agentDefinitionsQueryKey } =
  await import('../src/features/agents/use-agent-definitions')

const body =
  '## Update\n\nCompleted the **implementation** and checked `scrollTop`.\n\n- First\n- Second\n\n```ts\nconst ready = true\n```\n'.repeat(
    3,
  )
const me = { id: 'me', name: 'Me' }
const other = { id: 'ada', name: 'Ada' }
const message = (id: string, i: number): RoomMessage => ({
  id,
  roomId: 'bench',
  rootId: id === 'root' ? undefined : 'root',
  author: i % 2 ? me : other,
  text: body,
  createdAt: i + 1,
  attachments: [],
})
const run = (
  id: string,
  trigger: string,
  state: RoomRun['state'],
  stdout = '',
): RoomRun => ({
  id,
  roomId: 'bench',
  triggerMessageId: trigger,
  requestedBy: me,
  task: 'task',
  agentId: 'agent',
  provider: 'openai',
  model: 'm',
  state,
  createdAt: 50,
  completedAt: state === 'succeeded' ? 60 : undefined,
  stdout,
  output: state === 'succeeded' ? body : undefined,
})

const replyCount = 20
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
})
client.setQueryData(agentDefinitionsQueryKey, [])
client.setQueryData(['room-thread', 'bench', 'root'], {
  root: message('root', 0),
  replies: Array.from({ length: replyCount }, (_, i) =>
    message(`reply-${i}`, i + 1),
  ),
  results: [],
})
// Thread runs: one finished result + one triggered by a reply. Plus an
// unrelated main-timeline run whose stdout keeps changing.
const threadRuns = [
  run('done', 'reply-3', 'succeeded'),
  run('linked', 'reply-5', 'succeeded'),
]
// RoomView memoizes these, so they keep identity across renders.
const mentionHandles = ['Me', 'Ada']
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
const render = (runs: RoomRun[]) =>
  flushSync(() =>
    root.render(
      <QueryClientProvider client={client}>
        <RoomThreadRail
          roomId="bench"
          roomName="Benchmark thread"
          rootId="root"
          liveReplies={[]}
          runs={runs}
          openRun={() => {}}
          mentionHandles={mentionHandles}
          mentionableAccounts={[]}
          currentUserId="me"
          onClose={() => {}}
          sendReply={async () => undefined}
          editMessage={async () => undefined}
          onFocusReplyHandled={() => {}}
        />
      </QueryClientProvider>,
    ),
  )
render([...threadRuns, run('elsewhere', 'main-msg', 'running')])
const mountRows = rowRenders
const times: number[] = []
let steadyRows = 0
for (let i = 0; i < 40; i++) {
  rowRenders = 0
  const start = performance.now()
  // A run.changed for an unrelated run: mergeRuns copies the list; thread
  // runs keep their identity.
  render([...threadRuns, run('elsewhere', 'main-msg', 'running', `${i}`)])
  times.push(performance.now() - start)
  if (i >= 5) steadyRows += rowRenders
}
const sorted = times.slice(5).sort((a, b) => a - b)
console.table({
  rows: { value: replyCount + 1 + threadRuns.length },
  mountRowRenders: { value: mountRows },
  rowRendersPerUpdate: { value: steadyRows / 35 },
  medianMs: { value: +sorted[17].toFixed(2) },
  p95Ms: { value: +sorted[33].toFixed(2) },
})
// A thread run that actually changes must still re-render its row.
rowRenders = 0
render([
  threadRuns[0],
  { ...threadRuns[1], output: 'Revised result.' },
  run('elsewhere', 'main-msg', 'running'),
])
const changedRows = rowRenders
flushSync(() => root.unmount())
if (process.env.CHECK_RERENDER === '1' && steadyRows !== 0)
  throw new Error(
    `Expected zero thread row re-renders on unrelated parent updates, got ${steadyRows / 35} per update`,
  )
if (process.env.CHECK_RERENDER === '1' && changedRows === 0)
  throw new Error('A changed thread run must re-render its rows')
process.exit(0)
