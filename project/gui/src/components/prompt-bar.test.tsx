import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PromptBar } from './prompt-bar'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister()
})

test('Enter sends, Shift+Enter and IME composition do not', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const sent: string[] = []
  const root = createRoot(host)
  await act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PromptBar
          value="hello"
          onChange={() => undefined}
          onSubmit={async (text) => {
            sent.push(text)
            return true
          }}
          disabled={false}
          placeholder="Write a message…"
        />
      </QueryClientProvider>,
    )
  })
  const editor = host.querySelector<HTMLElement>('[contenteditable]')!
  const send = host.querySelector<HTMLButtonElement>(
    '[aria-label="Send message"]',
  )!
  expect(send.disabled).toBe(false)
  const press = async (init: KeyboardEventInit) => {
    await act(async () => {
      editor.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...init }),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  await press({ shiftKey: true })
  await press({ isComposing: true })
  expect(sent).toEqual([])
  await press({})
  expect(sent.map((text) => text.trim())).toEqual(['hello'])
  expect(send.disabled).toBe(true)

  await act(() => {
    root.unmount()
  })
  host.remove()
})
