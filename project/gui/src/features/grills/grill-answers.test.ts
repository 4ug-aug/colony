import { expect, test } from 'bun:test'
import {
  GRILL_OTHER_VALUE,
  formatSettledAnswer,
  isAnswerComplete,
  isOtherAnswer,
  otherDraftText,
} from './grill-answers'
import type { GrillQuestion } from './types'

const mcq: GrillQuestion = {
  id: 'q1',
  prompt: 'Pick one',
  choices: [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta', description: 'Second option' },
  ],
}

test('choice answers are complete and not other', () => {
  expect(isAnswerComplete(mcq, 'a')).toBe(true)
  expect(isOtherAnswer(mcq, 'a')).toBe(false)
  expect(formatSettledAnswer(mcq, 'b')).toBe('Beta — Second option')
})

test('other sentinel is incomplete until freeform text exists', () => {
  expect(isOtherAnswer(mcq, GRILL_OTHER_VALUE)).toBe(true)
  expect(isAnswerComplete(mcq, GRILL_OTHER_VALUE)).toBe(false)
  expect(otherDraftText(GRILL_OTHER_VALUE)).toBe('')
  expect(formatSettledAnswer(mcq, GRILL_OTHER_VALUE)).toBe('—')
})

test('freeform other text is complete and labeled in settled history', () => {
  expect(isOtherAnswer(mcq, 'something else')).toBe(true)
  expect(isAnswerComplete(mcq, 'something else')).toBe(true)
  expect(otherDraftText('something else')).toBe('something else')
  expect(formatSettledAnswer(mcq, 'something else')).toBe(
    'Other — something else',
  )
})
