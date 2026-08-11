import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto'

export type Sqlite = {
  prepare(sql: string): {
    get(...values: unknown[]): unknown
    all(...values: unknown[]): unknown
    run(...values: unknown[]): unknown
  }
  transaction<T>(fn: () => T): () => T
}

export type EncryptedSecretColumns = {
  api_key_ciphertext: string
  api_key_iv: string
  api_key_tag: string
}

export function createSecretBox(info: string) {
  const encryptionKey = (): Buffer => {
    const secret = process.env.BETTER_AUTH_SECRET
    if (!secret) throw new Error('BETTER_AUTH_SECRET is required')
    return Buffer.from(
      hkdfSync('sha256', secret, info, 'api-key-encryption', 32),
    )
  }

  return {
    encrypt(value: string) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
      const ciphertext = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final(),
      ])
      return {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
      }
    },
    decrypt(value: EncryptedSecretColumns): string {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        encryptionKey(),
        Buffer.from(value.api_key_iv, 'base64'),
      )
      decipher.setAuthTag(Buffer.from(value.api_key_tag, 'base64'))
      return Buffer.concat([
        decipher.update(Buffer.from(value.api_key_ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8')
    },
  }
}

export const validModel = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() && value.trim().length <= 200
    ? value.trim()
    : undefined
