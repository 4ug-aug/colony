import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { AttachmentSource } from '../../../../../inputs/repository'
import type { NewRoomAttachment, RoomStore } from './room-store'

export const MAX_ATTACHMENTS = 5
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_REQUEST_BYTES = 50 * 1024 * 1024

export function attachmentDirectory(databasePath: string): string {
  return resolve(dirname(resolve(databasePath)), 'attachments')
}

export function safeFilename(filename: string): string {
  const normalized = filename
    .normalize('NFKC')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0)
      return code < 0x20 ||
        code === 0x7f ||
        character === '\\' ||
        character === '/'
        ? '_'
        : character
    })
    .join('')
    .trim()
  return (normalized || 'attachment').slice(0, 255)
}

function rasterContentType(bytes: Uint8Array): string | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png'
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg'
  if (
    bytes.length >= 6 &&
    String.fromCharCode(...bytes.slice(0, 6)) in { GIF87a: true, GIF89a: true }
  )
    return 'image/gif'
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp'
  return undefined
}

function contentType(file: File, bytes: Uint8Array): string {
  const detected = rasterContentType(bytes)
  if (detected) return detected
  return /^[\w.+-]+\/[\w.+-]+$/.test(file.type) &&
    !file.type.startsWith('image/')
    ? file.type
    : 'application/octet-stream'
}

export async function stageAttachments(
  files: File[],
  directory: string,
  now = Date.now(),
): Promise<NewRoomAttachment[]> {
  if (files.length > MAX_ATTACHMENTS)
    throw new Error('A message can include at most 5 attachments')
  await mkdir(directory, { recursive: true })
  const staged: NewRoomAttachment[] = []
  try {
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES)
        throw new Error('Each attachment must be 10 MiB or smaller')
      const bytes = new Uint8Array(await file.arrayBuffer())
      const storageKey = randomUUID()
      const temporary = resolve(directory, `.${storageKey}.tmp`)
      await writeFile(temporary, bytes)
      await rename(temporary, resolve(directory, storageKey))
      staged.push({
        id: randomUUID(),
        filename: safeFilename(file.name),
        contentType: contentType(file, bytes),
        byteSize: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        storageKey,
        createdAt: now,
      })
    }
    return staged
  } catch (error) {
    await removeAttachmentFiles(
      directory,
      staged.map(({ storageKey }) => storageKey),
    )
    throw error
  }
}

export async function removeAttachmentFiles(
  directory: string,
  storageKeys: string[],
): Promise<void> {
  const root = resolve(directory)
  await Promise.all(
    storageKeys.map(async (storageKey) => {
      const path = resolve(root, storageKey)
      if (!path.startsWith(`${root}${sep}`))
        throw new Error('Invalid attachment storage key')
      await rm(path, { force: true })
    }),
  )
}

export async function attachmentBytes(
  directory: string,
  storageKey: string,
): Promise<Uint8Array | undefined> {
  const root = resolve(directory)
  const path = resolve(root, storageKey)
  if (!path.startsWith(`${root}${sep}`)) return undefined
  try {
    return await readFile(path)
  } catch {
    return undefined
  }
}

export function createRoomAttachmentSource(options: {
  store: RoomStore
  directory: string
}): AttachmentSource {
  return {
    async read(id) {
      const attachment = options.store.getAttachment(id)
      if (!attachment) return undefined
      const bytes = await attachmentBytes(
        options.directory,
        attachment.storageKey,
      )
      return bytes
        ? {
            roomId: attachment.roomId,
            filename: attachment.filename,
            byteSize: attachment.byteSize,
            sha256: attachment.sha256,
            bytes,
          }
        : undefined
    },
  }
}
