import { expect, test } from 'bun:test'
import { threadHistory } from './rooms-http'

const messages = (...sizes: number[]) =>
  sizes.map((size, index) => ({ id: `m${index}`, text: 'x'.repeat(size) }))

test('thread history keeps the newest messages within its budget', () => {
  expect(threadHistory(messages(10, 20)).map(({ id }) => id)).toEqual(['m0', 'm1'])
  expect(threadHistory(messages(...Array(30).fill(1))).map(({ id }) => id)[0]).toBe('m10')

  // A huge message is truncated; old messages past the budget are dropped.
  const kept = threadHistory(messages(...Array(15).fill(4_000), 1_000_000))
  expect(kept.at(-1)!.text).toContain('[message truncated: 1000000 chars]')
  expect(kept.reduce((total, { text }) => total + text.length, 0)).toBeLessThanOrEqual(40_000)
  expect(kept.at(0)!.id).not.toBe('m0')
})
