import { expect, test } from 'bun:test'
import { parseInviteDeepLink } from './invite-deep-link'

test('only valid Sweat invitation deep links are accepted', () => {
  expect(
    parseInviteDeepLink(
      'sweat://invite/token-123?server=https%3A%2F%2Fsweat.example.com',
    ),
  ).toEqual({ token: 'token-123', server: 'https://sweat.example.com' })
  expect(
    parseInviteDeepLink(
      'sweat://invite/token-123?server=javascript%3Aalert(1)',
    ),
  ).toBeUndefined()
  expect(
    parseInviteDeepLink(
      'sweat://invite/a%2Fb?server=https%3A%2F%2Fsweat.example.com',
    ),
  ).toBeUndefined()
})
