import { expect, test } from 'bun:test'
import { parseIssueDeepLink } from './issue-deep-link'

test('only valid sweat://issue deep links are accepted', () => {
  expect(
    parseIssueDeepLink(
      'sweat://issue/COL-5?server=https%3A%2F%2Fsweat.example.com',
    ),
  ).toEqual({ ref: 'COL-5', server: 'https://sweat.example.com' })
  expect(parseIssueDeepLink('sweat://issue/COL-5')).toEqual({ ref: 'COL-5' })
  expect(
    parseIssueDeepLink(
      'sweat://issue/COL-5?server=javascript%3Aalert(1)',
    ),
  ).toBeUndefined()
  expect(parseIssueDeepLink('sweat://invite/token-123')).toBeUndefined()
  expect(parseIssueDeepLink('sweat://issue/a%2Fb')).toBeUndefined()
})
