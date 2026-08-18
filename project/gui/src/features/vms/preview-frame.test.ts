import { expect, test } from 'bun:test'
import { previewIframeSrc } from './preview-frame'

test('a localhost GUI iframes Preview on localhost, not 127.0.0.1', () => {
  expect(previewIframeSrc('http://127.0.0.1:53738', 'localhost')).toBe(
    'http://localhost:53738/',
  )
})

test('a 127.0.0.1 GUI keeps the Preview host', () => {
  expect(previewIframeSrc('http://127.0.0.1:53738', '127.0.0.1')).toBe(
    'http://127.0.0.1:53738/',
  )
})

test('desktop webview hosts are not rewritten onto the Preview URL', () => {
  expect(previewIframeSrc('http://127.0.0.1:53738', 'tauri.localhost')).toBe(
    'http://127.0.0.1:53738/',
  )
})
