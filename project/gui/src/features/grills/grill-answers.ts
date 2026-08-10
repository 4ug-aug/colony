import type { GrillQuestion } from './types'

/** Draft sentinel while Other is selected but the freeform field is still empty. */
export const GRILL_OTHER_VALUE = '__grill_other__'

export function isChoiceAnswer(
  question: GrillQuestion,
  answer: string,
): boolean {
  return Boolean(question.choices?.some((choice) => choice.id === answer))
}

export function isOtherAnswer(
  question: GrillQuestion,
  answer: string,
): boolean {
  if (!question.choices || question.choices.length < 2) return false
  const value = answer.trim()
  if (!value) return false
  return value === GRILL_OTHER_VALUE || !isChoiceAnswer(question, value)
}

export function otherDraftText(answer: string): string {
  return answer === GRILL_OTHER_VALUE ? '' : answer
}

export function isAnswerComplete(
  answer: string | undefined,
): boolean {
  const value = (answer ?? '').trim()
  if (!value || value === GRILL_OTHER_VALUE) return false
  return true
}

export function formatSettledAnswer(
  question: GrillQuestion,
  answer?: string,
): string {
  const value = (answer ?? '').trim()
  if (!value || value === GRILL_OTHER_VALUE) return '—'
  const choice = question.choices?.find((item) => item.id === value)
  if (choice) {
    return choice.description
      ? `${choice.label} — ${choice.description}`
      : choice.label
  }
  if (question.choices && question.choices.length >= 2) {
    return `Other — ${value}`
  }
  return value
}
