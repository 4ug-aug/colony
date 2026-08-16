import { expect, test } from 'bun:test'
import {
  ACCOUNT_COLORS,
  accountColor,
  accountInk,
  accountInitials,
  parseAccountColor,
} from './account-color'

test('account initials use two letters from the visible name', () => {
  expect(accountInitials('ada')).toBe('AD')
  expect(accountInitials('Ada Lovelace')).toBe('AL')
  expect(accountInitials('x')).toBe('X')
  expect(accountInitials('  ')).toBe('?')
})

test('username hashes to a stable palette color', () => {
  expect(accountColor('ada')).toBe('#0f766e')
  expect(accountColor('bob')).toBe('#0369a1')
  expect(accountColor('ada')).not.toBe(accountColor('bob'))
})

test('chosen account color wins over the username hash', () => {
  expect(accountColor('ada', '#1d4ed8')).toBe('#1d4ed8')
  expect(accountColor('ada', '#ffffff')).toBe('#ffffff')
  expect(accountColor('ada', '')).toBe('#0f766e')
})

test('parseAccountColor accepts 3- and 6-digit hex', () => {
  expect(parseAccountColor('#fff')).toBe('#ffffff')
  expect(parseAccountColor('1D4ED8')).toBe('#1d4ed8')
  expect(parseAccountColor('  #0f0  ')).toBe('#00ff00')
  expect(parseAccountColor('#gggggg')).toBeUndefined()
  expect(parseAccountColor('')).toBeUndefined()
})

test('account ink is dark on light backgrounds', () => {
  expect(accountInk('#ffffff')).toBe('#1c1917')
  expect(accountInk('#1d4ed8')).toBe('#fff')
})

test('palette accents are valid account colors', () => {
  expect(
    ACCOUNT_COLORS.every((color) => parseAccountColor(color) === color),
  ).toBe(true)
})
