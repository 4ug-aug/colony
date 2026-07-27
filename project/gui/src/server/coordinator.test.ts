import { expect, test } from 'bun:test'
import { createServer } from 'node:net'
import { createCoordinator, type SessionAuthenticator } from './coordinator'
import type { RunControl, RunSummary, Step } from './run-control'
import {
  GENERAL_ROOM_ID,
  type RoomMessage,
  type RoomRun,
  type RoomSummary,
  type RoomStore,
  type StoredStep,
} from './room-store'
import { createRoomMessageHub } from './room-hub'

class FakeRunControl implements RunControl {
  private listeners = new Set<(run: RunSummary) => void>()
  private stepListeners = new Set<(runId: string, step: Step) => void>()
  private runs: RunSummary[] = []
  listRuns() {
    return this.runs
  }
  subscribe(listener: (run: RunSummary) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  subscribeSteps(listener: (runId: string, step: Step) => void) {
    this.stepListeners.add(listener)
    return () => this.stepListeners.delete(listener)
  }
  start(task: string, _context: { roomId: string }) {
    const run: RunSummary = {
      id: crypto.randomUUID(),
      task,
      agentId: 'software-engineer',
      state: 'preparing',
      createdAt: Date.now(),
      stdout: '',
      stderr: '',
    }
    this.runs = [...this.runs, run]
    this.publish(run)
    return run.id
  }
  async cancel(id: string) {
    const run = this.runs.find((item) => item.id === id)
    if (!run) return undefined
    const changed = {
      ...run,
      state: 'cancelled' as const,
      completedAt: Date.now(),
    }
    this.runs = this.runs.map((item) => (item.id === id ? changed : item))
    this.publish(changed)
    return changed
  }
  emitStep(runId: string, step: Step) {
    for (const listener of this.stepListeners) listener(runId, step)
  }
  private publish(run: RunSummary) {
    for (const listener of this.listeners) listener(run)
  }
}
class MemoryRoomStore implements RoomStore {
  rooms: RoomSummary[] = [{ id: GENERAL_ROOM_ID, name: 'General' }]
  messages: RoomMessage[] = []
  runs: RoomRun[] = []
  steps: StoredStep[] = []
  listRooms() {
    return this.rooms
  }
  getRoom(id: string) {
    return this.rooms.find((room) => room.id === id)
  }
  createRoom(room: RoomSummary) {
    if (
      this.rooms.some(
        (item) => item.name.toLowerCase() === room.name.toLowerCase(),
      )
    )
      return false
    this.rooms.push(room)
    return true
  }
  listMessages(roomId: string) {
    return this.messages.filter((message) => message.roomId === roomId)
  }
  listRuns(roomId: string) {
    return this.runs.filter((run) => run.roomId === roomId)
  }
  createMessage(message: RoomMessage) {
    this.messages.push(message)
  }
  createRun(run: RoomRun) {
    this.runs.push(run)
  }
  updateRun(run: RoomRun) {
    this.runs = this.runs.map((item) => (item.id === run.id ? run : item))
  }
  failStaleRuns() {
    return []
  }
  getRun(id: string) {
    return this.runs.find((run) => run.id === id)
  }
  appendStep(step: StoredStep) {
    this.steps.push(step)
  }
  listSteps(runId: string) {
    return this.steps.filter((s) => s.runId === runId).sort((a, b) => a.idx - b.idx)
  }
  latestStepsForActiveRuns(roomId: string) {
    const map = new Map<string, StoredStep>()
    const activeRunIds = new Set(
      this.runs
        .filter((r) => r.roomId === roomId && (r.state === 'preparing' || r.state === 'running'))
        .map((r) => r.id),
    )
    for (const step of this.steps) {
      if (!activeRunIds.has(step.runId)) continue
      const existing = map.get(step.runId)
      if (!existing || step.idx > existing.idx) map.set(step.runId, step)
    }
    return map
  }
}
const authorized: SessionAuthenticator = {
  authenticate: async () => ({ id: 'user-1', name: 'Ada' }),
}
const port = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('No port')),
      )
    })
  })
type TestSocket = {
  socket: WebSocket
  next(): Promise<Record<string, unknown>>
}
const expectNoEvent = async (socket: TestSocket): Promise<void> => {
  const received = await Promise.race([
    socket.next().then(() => true),
    Bun.sleep(25).then(() => false),
  ])
  expect(received).toBe(false)
}
const open = (url: string) =>
  new Promise<TestSocket>((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: { origin: 'http://gui.test' },
    } as never)
    const messages: Record<string, unknown>[] = []
    const waiters: ((message: Record<string, unknown>) => void)[] = []
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data) as Record<string, unknown>
      const waiter = waiters.shift()
      if (waiter) waiter(message)
      else messages.push(message)
    })
    socket.onopen = () =>
      resolve({
        socket,
        next: () => {
          const message = messages.shift()
          return message
            ? Promise.resolve(message)
            : new Promise((done) => waiters.push(done))
        },
      })
    socket.onerror = () => reject(new Error('socket failed'))
  })

test('two clients receive durable room messages and agent runs', async () => {
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const coordinator = createCoordinator({
    control,
    store,
    messages,
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    expect(
      (
        await fetch(`${base}/api/rooms`, {
          headers: { origin: 'http://gui.test' },
        })
      ).status,
    ).toBe(200)
    const a = await open(
      `${base.replace('http', 'ws')}/api/rooms/general/stream`,
    )
    const b = await open(
      `${base.replace('http', 'ws')}/api/rooms/general/stream`,
    )
    expect((await a.next()).type).toBe('room.snapshot')
    expect((await b.next()).type).toBe('room.snapshot')
    const messageA = a.next()
    const messageB = b.next()
    const response = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@software-engineer Fix it' }),
    })
    expect(response.status).toBe(202)
    expect((await messageA).type).toBe('message.created')
    expect((await messageB).type).toBe('message.created')
    const run = ((await response.json()) as { run: RoomRun }).run
    expect(run.task).toBe('Fix it')
    expect(store.messages).toHaveLength(1)
    expect(store.runs).toHaveLength(1)
    expect(await a.next()).toMatchObject({
      type: 'run.changed',
      run: { id: run.id, state: 'preparing' },
    })
    expect(await b.next()).toMatchObject({
      type: 'run.changed',
      run: { id: run.id, state: 'preparing' },
    })
    const changedA = a.next()
    const changedB = b.next()
    const cancelled = await fetch(
      `${base}/api/rooms/general/runs/${run.id}/cancel`,
      { method: 'POST', headers: { origin: 'http://gui.test' } },
    )
    expect(cancelled.status).toBe(200)
    expect(await changedA).toMatchObject({
      type: 'run.changed',
      run: { id: run.id, state: 'cancelled' },
    })
    expect(await changedB).toMatchObject({
      type: 'run.changed',
      run: { id: run.id, state: 'cancelled' },
    })
    const emptyTask = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@software-engineer ' }),
    })
    expect(emptyTask.status).toBe(400)
    expect(store.messages).toHaveLength(1)
    const inline = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Please @software-engineer fix the login' }),
    })
    expect(((await inline.json()) as { run: RoomRun }).run.task).toBe(
      'Please fix the login',
    )
    expect(
      (
        await fetch(`${base}/api/rooms/other/messages`, {
          method: 'POST',
          headers: { origin: 'http://gui.test' },
        })
      ).status,
    ).toBe(404)
    a.socket.close()
    b.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('rooms are created once and streams stay isolated', async () => {
  const control = new FakeRunControl()
  const store = new MemoryRoomStore()
  const coordinator = createCoordinator({
    control,
    store,
    messages: createRoomMessageHub(store),
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    const general = await open(
      `${base.replace('http', 'ws')}/api/rooms/general/stream`,
    )
    expect((await general.next()).type).toBe('room.snapshot')
    const createdEvent = general.next()
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Product' }),
    })
    expect(created.status).toBe(201)
    const room = ((await created.json()) as { room: RoomSummary }).room
    expect(await createdEvent).toMatchObject({ type: 'room.created', room })
    expect(
      (
        await fetch(`${base}/api/rooms`, {
          method: 'POST',
          headers: {
            origin: 'http://gui.test',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: ' product ' }),
        })
      ).status,
    ).toBe(409)
    expect(
      (
        await fetch(`${base}/api/rooms`, {
          method: 'POST',
          headers: {
            origin: 'http://gui.test',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: ' ' }),
        })
      ).status,
    ).toBe(400)
    const product = await open(
      `${base.replace('http', 'ws')}/api/rooms/${room.id}/stream`,
    )
    expect(await product.next()).toMatchObject({ type: 'room.snapshot', room })
    const productMessage = product.next()
    const sent = await fetch(`${base}/api/rooms/${room.id}/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'Only product' }),
    })
    expect(sent.status).toBe(201)
    expect(await productMessage).toMatchObject({
      type: 'message.created',
      message: { roomId: room.id },
    })
    const delegated = await fetch(`${base}/api/rooms/${room.id}/messages`, {
      method: 'POST',
      headers: {
        origin: 'http://gui.test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: '@software-engineer Fix product' }),
    })
    const run = ((await delegated.json()) as { run: RoomRun }).run
    expect(await product.next()).toMatchObject({
      type: 'message.created',
      message: { roomId: room.id, text: '@software-engineer Fix product' },
    })
    expect(await product.next()).toMatchObject({
      type: 'run.changed',
      run: { id: run.id, roomId: room.id, state: 'preparing' },
    })
    await expectNoEvent(general)
    expect(
      (
        await fetch(`${base}/api/rooms/general/runs/${run.id}/cancel`, {
          method: 'POST',
          headers: { origin: 'http://gui.test' },
        })
      ).status,
    ).toBe(404)
    general.socket.close()
    product.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('room endpoints require a session', async () => {
  const store = new MemoryRoomStore()
  const coordinator = createCoordinator({
    control: new FakeRunControl(),
    store,
    messages: createRoomMessageHub(store),
    authenticator: { authenticate: async () => undefined },
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  try {
    const response = await fetch(
      `http://localhost:${coordinator.port}/api/rooms`,
      {
        headers: { origin: 'http://gui.test' },
      },
    )
    expect(response.status).toBe(401)
  } finally {
    coordinator.stop()
  }
})

test('localhost Vite ports are allowed when the configured GUI is localhost', async () => {
  const store = new MemoryRoomStore()
  const coordinator = createCoordinator({
    control: new FakeRunControl(),
    store,
    messages: createRoomMessageHub(store),
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://localhost:3000',
    port: await port(),
  })
  try {
    const response = await fetch(
      `http://localhost:${coordinator.port}/api/auth/sign-in/email`,
      {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3002' },
      },
    )
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:3002',
    )
    expect(
      (
        await fetch(`http://localhost:${coordinator.port}/api/rooms`, {
          headers: { origin: 'http://evil.test' },
        })
      ).status,
    ).toBe(403)
  } finally {
    coordinator.stop()
  }
})

test('hub post by non-HTTP caller broadcasts message.created to subscribed socket', async () => {
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const coordinator = createCoordinator({
    control,
    store,
    messages,
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    const socket = await open(`${base.replace('http', 'ws')}/api/rooms/general/stream`)
    expect((await socket.next()).type).toBe('room.snapshot')
    const pending = socket.next()
    messages.postMessage({
      roomId: GENERAL_ROOM_ID,
      author: { kind: 'agent', id: 'software-engineer', name: 'Software engineer' },
      text: 'Agent says hello',
    })
    const event = await pending
    expect(event).toMatchObject({
      type: 'message.created',
      message: { roomId: GENERAL_ROOM_ID, text: 'Agent says hello' },
    })
    socket.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('agent-authored hub post does NOT create a run', async () => {
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const coordinator = createCoordinator({
    control,
    store,
    messages,
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    const socket = await open(`${base.replace('http', 'ws')}/api/rooms/general/stream`)
    expect((await socket.next()).type).toBe('room.snapshot')
    const pending = socket.next()
    messages.postMessage({
      roomId: GENERAL_ROOM_ID,
      author: { kind: 'agent', id: 'software-engineer', name: 'Software engineer' },
      text: '@software-engineer do something',
    })
    const event = await pending
    expect(event.type).toBe('message.created')
    // No run should be created by an agent hub post
    expect(control.listRuns()).toHaveLength(0)
    expect(store.runs).toHaveLength(0)
    await expectNoEvent(socket)
    socket.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('step events are persisted and broadcast as run.step to room sockets', async () => {
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const coordinator = createCoordinator({
    control,
    store,
    messages,
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    // Start a run
    const response = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: { origin: 'http://gui.test', 'content-type': 'application/json' },
      body: JSON.stringify({ text: '@software-engineer Do something' }),
    })
    expect(response.status).toBe(202)
    const { run } = (await response.json()) as { run: RoomRun }

    // Create another room to test isolation before opening sockets
    await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { origin: 'http://gui.test', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Other' }),
    })
    const otherRoom = store.rooms.find((r) => r.name === 'Other')!

    // Open two sockets: one in general room, one in other room
    const general = await open(`${base.replace('http', 'ws')}/api/rooms/general/stream`)
    // Consume the snapshot
    expect((await general.next()).type).toBe('room.snapshot')
    const other = await open(`${base.replace('http', 'ws')}/api/rooms/${otherRoom.id}/stream`)
    expect((await other.next()).type).toBe('room.snapshot')

    // Emit two steps
    const step1: Step = { kind: 'message', text: 'Hello', at: Date.now() }
    const step2: Step = { kind: 'tool_call', text: '{}', tool: 'shell', callId: 'c1', at: Date.now() }
    const stepEvent1 = general.next()
    control.emitStep(run.id, step1)
    const received1 = await stepEvent1
    expect(received1).toMatchObject({ type: 'run.step', runId: run.id, step: { idx: 0, kind: 'message', text: 'Hello' } })

    const stepEvent2 = general.next()
    control.emitStep(run.id, step2)
    const received2 = await stepEvent2
    expect(received2).toMatchObject({ type: 'run.step', runId: run.id, step: { idx: 1, kind: 'tool_call', tool: 'shell', callId: 'c1' } })

    // Steps are persisted with sequential idx
    const persisted = store.listSteps(run.id)
    expect(persisted).toHaveLength(2)
    expect(persisted[0]).toMatchObject({ idx: 0, kind: 'message', text: 'Hello' })
    expect(persisted[1]).toMatchObject({ idx: 1, kind: 'tool_call', tool: 'shell' })

    // Other room socket received no step events
    await expectNoEvent(other)

    general.socket.close()
    other.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('room.snapshot includes latestSteps for active runs', async () => {
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const coordinator = createCoordinator({
    control,
    store,
    messages,
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    // Start a run and emit a step
    const response = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: { origin: 'http://gui.test', 'content-type': 'application/json' },
      body: JSON.stringify({ text: '@software-engineer Do something' }),
    })
    const { run } = (await response.json()) as { run: RoomRun }
    // Update run to 'running' so latestStepsForActiveRuns sees it
    store.updateRun({ ...run, state: 'running' })
    control.emitStep(run.id, { kind: 'message', text: 'Step A', at: Date.now() })

    // Fresh socket should get latestSteps
    const socket = await open(`${base.replace('http', 'ws')}/api/rooms/general/stream`)
    const snapshot = await socket.next()
    expect(snapshot.type).toBe('room.snapshot')
    const latestSteps = snapshot.latestSteps as StoredStep[]
    expect(latestSteps).toHaveLength(1)
    expect(latestSteps[0]).toMatchObject({ runId: run.id, idx: 0, text: 'Step A' })

    socket.socket.close()
  } finally {
    coordinator.stop()
  }
})

test('GET /runs/:runId/steps returns step history, 404 for unknown/mismatched run, 401 without auth', async () => {
  const store = new MemoryRoomStore()
  const control = new FakeRunControl()
  const messages = createRoomMessageHub(store)
  const coordinator = createCoordinator({
    control,
    store,
    messages,
    authenticator: authorized,
    authHandler: async () => new Response('ok'),
    origin: 'http://gui.test',
    port: await port(),
  })
  const base = `http://localhost:${coordinator.port}`
  try {
    // Start a run in general
    const response = await fetch(`${base}/api/rooms/general/messages`, {
      method: 'POST',
      headers: { origin: 'http://gui.test', 'content-type': 'application/json' },
      body: JSON.stringify({ text: '@software-engineer Do something' }),
    })
    const { run } = (await response.json()) as { run: RoomRun }
    control.emitStep(run.id, { kind: 'message', text: 'First', at: 1000 })
    control.emitStep(run.id, { kind: 'message', text: 'Second', at: 2000 })

    // Correct request
    const ok = await fetch(`${base}/api/rooms/general/runs/${run.id}/steps`, {
      headers: { origin: 'http://gui.test' },
    })
    expect(ok.status).toBe(200)
    const { steps } = (await ok.json()) as { steps: StoredStep[] }
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ idx: 0, text: 'First' })
    expect(steps[1]).toMatchObject({ idx: 1, text: 'Second' })

    // Unknown run
    expect(
      (await fetch(`${base}/api/rooms/general/runs/unknown-id/steps`, {
        headers: { origin: 'http://gui.test' },
      })).status,
    ).toBe(404)

    // Run exists but wrong room
    expect(
      (await fetch(`${base}/api/rooms/other-room/runs/${run.id}/steps`, {
        headers: { origin: 'http://gui.test' },
      })).status,
    ).toBe(404)

    // No auth — use unauthenticated coordinator
    const noAuthCoord = createCoordinator({
      control: new FakeRunControl(),
      store: new MemoryRoomStore(),
      messages: createRoomMessageHub(new MemoryRoomStore()),
      authenticator: { authenticate: async () => undefined },
      authHandler: async () => new Response('ok'),
      origin: 'http://gui.test',
      port: await port(),
    })
    try {
      expect(
        (await fetch(`http://localhost:${noAuthCoord.port}/api/rooms/general/runs/x/steps`, {
          headers: { origin: 'http://gui.test' },
        })).status,
      ).toBe(401)
    } finally {
      noAuthCoord.stop()
    }
  } finally {
    coordinator.stop()
  }
})
