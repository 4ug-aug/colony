import { expect, test } from 'bun:test'
import { createServer } from 'node:net'
import { createCoordinator, type SessionAuthenticator } from './coordinator'
import type { RunControl, RunSummary } from './run-control'
import {
  GENERAL_ROOM_ID,
  type RoomMessage,
  type RoomRun,
  type RoomSummary,
  type RoomStore,
} from './room-store'

class FakeRunControl implements RunControl {
  private listeners = new Set<(run: RunSummary) => void>()
  private runs: RunSummary[] = []
  listRuns() {
    return this.runs
  }
  subscribe(listener: (run: RunSummary) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  start(task: string) {
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
  private publish(run: RunSummary) {
    for (const listener of this.listeners) listener(run)
  }
}
class MemoryRoomStore implements RoomStore {
  rooms: RoomSummary[] = [{ id: GENERAL_ROOM_ID, name: 'General' }]
  messages: RoomMessage[] = []
  runs: RoomRun[] = []
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
  const coordinator = createCoordinator({
    control,
    store,
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
  const coordinator = createCoordinator({
    control,
    store: new MemoryRoomStore(),
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
  const coordinator = createCoordinator({
    control: new FakeRunControl(),
    store: new MemoryRoomStore(),
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
  const coordinator = createCoordinator({
    control: new FakeRunControl(),
    store: new MemoryRoomStore(),
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
