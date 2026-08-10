import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { attachmentBytes, attachmentDirectory } from '../src/server/attachments'
import {
  createSqliteRoomStore,
  GENERAL_ROOM_ID,
  type RoomAttachment,
  type RoomMessage,
  type RoomStore,
} from '../src/server/room-store'

const messageCount = 10_000
const imageCount = 1_000
const imageBytes = 100 * 1024
const pageSize = 50
const samples = 20
const messageText = 'Deterministic benchmark message. '.padEnd(500, 'x')

type Timings = {
  initialPage: number
  initialImages: number
  fullHistory: number
  fullImages: number
  fullTotal: number
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function attachmentsFrom(messages: RoomMessage[]): RoomAttachment[] {
  return messages.flatMap(({ attachments }) => attachments)
}

function loadFullHistory(store: RoomStore): RoomMessage[] {
  const messages: RoomMessage[] = []
  let cursor: string | undefined
  do {
    const page = store.listRoomHistoryPage(GENERAL_ROOM_ID, {
      limit: pageSize,
      ...(cursor ? { cursor } : {}),
    })
    messages.push(...page.messages)
    cursor = page.nextCursor
  } while (cursor)
  return messages
}

async function readImages(
  directory: string,
  attachments: RoomAttachment[],
): Promise<number> {
  const images = await Promise.all(
    attachments.map(({ id }) => attachmentBytes(directory, id)),
  )
  assert(images.every(Boolean), 'An image file was not loaded')
  return images.reduce((total, bytes) => total + bytes!.byteLength, 0)
}

async function timed<T>(run: () => T | Promise<T>) {
  const startedAt = performance.now()
  const value = await run()
  return { value, elapsed: performance.now() - startedAt }
}

async function sample(store: RoomStore, directory: string): Promise<Timings> {
  const initial = await timed(() =>
    store.listRoomHistoryPage(GENERAL_ROOM_ID, { limit: pageSize }),
  )
  const initialAttachments = attachmentsFrom(initial.value.messages)
  assert(initial.value.messages.length === pageSize, 'Wrong initial page size')
  assert(initialAttachments.length === 5, 'Wrong initial image count')

  const initialImageLoad = await timed(() =>
    readImages(directory, initialAttachments),
  )
  assert(
    initialImageLoad.value === initialAttachments.length * imageBytes,
    'Wrong initial image byte total',
  )

  const history = await timed(() => loadFullHistory(store))
  const allAttachments = attachmentsFrom(history.value)
  assert(history.value.length === messageCount, 'Wrong full message count')
  assert(allAttachments.length === imageCount, 'Wrong full image count')

  const fullImageLoad = await timed(() => readImages(directory, allAttachments))
  assert(
    fullImageLoad.value === imageCount * imageBytes,
    'Wrong full image byte total',
  )

  return {
    initialPage: initial.elapsed,
    initialImages: initialImageLoad.elapsed,
    fullHistory: history.elapsed,
    fullImages: fullImageLoad.elapsed,
    fullTotal: history.elapsed + fullImageLoad.elapsed,
  }
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length / 2
  const median = (sorted[middle - 1]! + sorted[middle]!) / 2
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!
  return { median: `${median.toFixed(2)} ms`, p95: `${p95.toFixed(2)} ms` }
}

const temporary = await mkdtemp(join(tmpdir(), 'sweat-room-benchmark-'))
let sqlite: Database | undefined

try {
  const databasePath = join(temporary, 'sweat.sqlite')
  sqlite = new Database(databasePath, { create: true })
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA busy_timeout = 5000')
  migrate(drizzle(sqlite), {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  })

  const directory = attachmentDirectory(databasePath)
  await mkdir(directory, { recursive: true })
  const payload = new Uint8Array(imageBytes)
  payload.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const insertMessage = sqlite.prepare(
    'INSERT INTO room_message (id, room_id, author_id, author_name, author_image, author_kind, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const insertAttachment = sqlite.prepare(
    'INSERT INTO room_attachment (id, message_id, filename, content_type, byte_size, sha256, storage_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  sqlite.prepare('BEGIN').run()
  try {
    for (let index = 1; index <= messageCount; index++) {
      const messageId = `message-${index.toString().padStart(5, '0')}`
      insertMessage.run(
        messageId,
        GENERAL_ROOM_ID,
        `author-${index % 10}`,
        `Author ${index % 10}`,
        null,
        index % 2 ? 'user' : 'agent',
        messageText,
        index,
      )
      if (index % 10) continue
      const id = `image-${index / 10}`
      insertAttachment.run(
        id,
        messageId,
        `${id}.png`,
        'image/png',
        imageBytes,
        '0'.repeat(64),
        id,
        index,
      )
    }
    sqlite.prepare('COMMIT').run()
  } catch (error) {
    sqlite.prepare('ROLLBACK').run()
    throw error
  }

  for (let index = 1; index <= imageCount; index++)
    await writeFile(join(directory, `image-${index}`), payload)

  const store = createSqliteRoomStore(sqlite)
  await sample(store, directory)
  const results: Timings[] = []
  for (let index = 0; index < samples; index++)
    results.push(await sample(store, directory))

  console.log(
    `Room: ${messageCount.toLocaleString()} messages, ${imageCount.toLocaleString()} images × ${imageBytes / 1024} KiB (${((imageCount * imageBytes) / 1024 / 1024).toFixed(2)} MiB total)`,
  )
  console.table(
    Object.fromEntries(
      [
        ['Initial page', 'initialPage'],
        ['Initial images', 'initialImages'],
        ['Full history', 'fullHistory'],
        ['Full images', 'fullImages'],
        ['Full total', 'fullTotal'],
      ].map(([label, key]) => [
        label,
        stats(results.map((result) => result[key as keyof Timings])),
      ]),
    ),
  )
} finally {
  sqlite?.close()
  await rm(temporary, { recursive: true, force: true })
}
