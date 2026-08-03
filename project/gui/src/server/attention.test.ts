import { expect, test } from 'bun:test'
import { mentionedAccounts } from './attention'

const accounts = [
  { id: 'ada', name: 'ada', username: 'ada' },
  { id: 'ann', name: 'ann', username: 'ann' },
  {
    id: 'agent-collision',
    name: 'software-engineer',
    username: 'software-engineer',
  },
]

test('account mentions use exact handles and punctuation boundaries', () => {
  expect(
    mentionedAccounts('@ada, please pair with (@ann).', accounts).map(
      ({ id }) => id,
    ),
  ).toEqual(['ada', 'ann'])
  expect(mentionedAccounts('@Ada @annette email@ada', accounts)).toEqual([])
  expect(mentionedAccounts('@software-engineer fix it', accounts)).toEqual([])
  expect(mentionedAccounts('@antboy fix it', accounts)).toEqual([])
})
