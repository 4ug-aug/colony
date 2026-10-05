import { expect, test } from 'bun:test'
import { threadHistory, transcriptMessage } from './run-history'

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

test('a Consultation reads as one agent asking another on the account’s behalf', () => {
  const delivery = { kind: 'consultation' as const, askingAgentId: 'antboy' }
  const question = transcriptMessage({
    author: { kind: 'agent' as const, id: 'antboy', name: 'Antboy' },
    text: 'What is the best DJ song?',
    delivery,
  })
  expect(question.text).toBe(
    'Consultation from Antboy, another agent, asking for this Chamber’s account:\nWhat is the best DJ song?',
  )
  const answerMessage = {
    author: { kind: 'agent' as const, id: 'dj-master', name: 'DJ Master' },
    text: 'Good Times by Chic.',
    delivery,
  }
  const names = (id: string) => (id === 'antboy' ? 'Antboy' : id)
  expect(transcriptMessage(answerMessage, names).text).toBe(
    'Answer to Antboy’s Consultation:\nGood Times by Chic.',
  )
  // Without a way to name agents it still reads as an answer, not a plain message.
  expect(transcriptMessage(answerMessage).text).toBe(
    'Answer to another agent’s Consultation:\nGood Times by Chic.',
  )
})
