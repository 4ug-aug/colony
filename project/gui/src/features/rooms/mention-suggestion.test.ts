import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { QueryClient } from '@tanstack/react-query'
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { act } from 'react'
import { suggestionMenu, type MentionItem } from './mention-suggestion'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(async () => {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister()
})

const agentItem: MentionItem = {
  id: 'antboy',
  label: 'antboy',
  name: 'Antboy',
  description: 'Sweat the small stuff',
  kind: 'agent',
}

test('mention popup renders agent rows when mounted outside the app tree', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const mentionOpen = { current: false }
  const renderer = suggestionMenu(mentionOpen, { current: host }, queryClient)

  await act(() => {
    renderer.onStart({
      items: [agentItem],
      command: () => undefined,
    })
  })

  expect(mentionOpen.current).toBe(true)
  expect(host.textContent).toContain('Agents')
  expect(host.textContent).toContain('Antboy')
  expect(host.textContent).toContain('Sweat the small stuff')

  await act(() => {
    renderer.onExit()
  })
  host.remove()
})

test('loading suggestion updates do not clear a visible mention menu', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const mentionOpen = { current: false }
  const renderer = suggestionMenu(mentionOpen, { current: host }, queryClient)
  const command = () => undefined

  await act(() => {
    renderer.onStart({ items: [], command, loading: true })
  })
  expect(mentionOpen.current).toBe(true)
  expect(host.querySelector('.mention-menu')).toBeTruthy()
  expect(host.querySelector('.mention-menu')?.hidden).toBe(true)

  await act(() => {
    renderer.onUpdate({ items: [agentItem], command, loading: false })
  })
  expect(host.querySelector('.mention-menu')?.hidden).toBe(false)
  expect(host.textContent).toContain('Antboy')

  await act(() => {
    renderer.onUpdate({ items: [], command, loading: true })
  })
  expect(host.textContent).toContain('Antboy')

  await act(() => {
    renderer.onExit()
  })
  expect(host.querySelector('.mention-menu')).toBeNull()
  host.remove()
})

test('backspacing the bare @ dismisses the mention menu', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const mentionOpen = { current: false }
  const renderer = suggestionMenu(mentionOpen, { current: host }, queryClient)

  await act(() => {
    renderer.onStart({
      items: [agentItem],
      command: () => undefined,
      query: '',
      text: '@',
    })
  })
  expect(host.querySelector('.mention-menu')).toBeTruthy()

  await act(() => {
    renderer.onKeyDown({
      event: new KeyboardEvent('keydown', { key: 'Backspace' }),
    })
  })
  expect(host.querySelector('.mention-menu')).toBeNull()
  expect(mentionOpen.current).toBe(false)
  host.remove()
})

test('an update with empty trigger text dismisses the mention menu', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const mentionOpen = { current: false }
  const renderer = suggestionMenu(mentionOpen, { current: host }, queryClient)
  const command = () => undefined

  await act(() => {
    renderer.onStart({
      items: [agentItem],
      command,
      query: '',
      text: '@',
    })
  })

  await act(() => {
    renderer.onUpdate({
      items: [],
      command,
      query: '',
      text: '',
      loading: false,
    })
  })
  expect(host.querySelector('.mention-menu')).toBeNull()
  expect(mentionOpen.current).toBe(false)
  host.remove()
})

test('onStart fills items locally so the menu is not hidden while TipTap loads', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const mentionOpen = { current: false }
  const renderer = suggestionMenu(
    mentionOpen,
    { current: host },
    queryClient,
    () => [agentItem],
  )

  await act(() => {
    renderer.onStart({
      items: [],
      command: () => undefined,
      loading: true,
      query: '',
      text: '@',
    })
  })
  expect(host.querySelector('.mention-menu')?.hidden).toBe(false)
  expect(host.textContent).toContain('Antboy')

  await act(() => {
    renderer.onExit()
  })
  host.remove()
})
