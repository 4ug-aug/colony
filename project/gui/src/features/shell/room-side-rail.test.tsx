import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { Profiler, act } from 'react'
import { createRoot } from 'react-dom/client'
import { RoomSideRail } from './room-side-rail'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered)
    GlobalRegistrator.register({ width: 1440, height: 900 })
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

afterAll(async () => {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister()
})

test('dragging the rail edge resizes without re-rendering and persists', async () => {
  localStorage.removeItem('thread.width')
  const host = document.createElement('div')
  document.body.append(host)
  Object.defineProperty(host, 'clientWidth', { value: 1200 })
  const root = createRoot(host)
  let commits = 0
  await act(async () =>
    root.render(
      <Profiler id="rail" onRender={() => commits++}>
        <RoomSideRail label="Thread" description="" onClose={() => {}}>
          <p>content</p>
        </RoomSideRail>
      </Profiler>,
    ),
  )
  const rail = host.querySelector('aside')!
  const handle = host.querySelector<HTMLElement>('[role="separator"]')!
  expect(rail.style.width).toBe('26rem')
  Object.defineProperty(rail, 'offsetWidth', {
    get: () =>
      rail.style.width.endsWith('rem')
        ? parseFloat(rail.style.width) * 16
        : parseFloat(rail.style.width),
  })
  commits = 0
  const pointer = (type: string, clientX: number) =>
    act(() => {
      handle.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          pointerId: 1,
          clientX,
        }),
      )
    })
  await pointer('pointerdown', 800)
  await pointer('pointermove', 700)
  expect(rail.style.width).toBe('516px')
  // Clamped to the rail's own maximum.
  await pointer('pointermove', 0)
  expect(rail.style.width).toBe('640px')
  // Clamped to the rail's own minimum.
  await pointer('pointermove', 1400)
  expect(rail.style.width).toBe('360px')
  await pointer('pointerup', 1400)
  expect(commits).toBe(0)
  expect(localStorage.getItem('thread.width')).toBe('360px')

  await act(() => {
    handle.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }),
    )
  })
  expect(rail.style.width).toBe('376px')
  expect(localStorage.getItem('thread.width')).toBe('376px')

  await act(async () => root.unmount())
  const remounted = createRoot(host)
  await act(async () =>
    remounted.render(
      <RoomSideRail label="Thread" description="" onClose={() => {}}>
        <p>content</p>
      </RoomSideRail>,
    ),
  )
  expect(host.querySelector('aside')!.style.width).toBe('376px')
  await act(async () => remounted.unmount())
  host.remove()
})

test('the Room keeps its minimum width, and saved widths are clamped', async () => {
  localStorage.setItem('thread.width', '880px')
  const host = document.createElement('div')
  document.body.append(host)
  Object.defineProperty(host, 'clientWidth', { value: 900 })
  const root = createRoot(host)
  await act(async () =>
    root.render(
      <RoomSideRail label="Thread" description="" onClose={() => {}}>
        <p>content</p>
      </RoomSideRail>,
    ),
  )
  const rail = host.querySelector('aside')!
  expect(rail.style.width).toBe('640px')
  Object.defineProperty(rail, 'offsetWidth', { value: 400 })
  const handle = host.querySelector<HTMLElement>('[role="separator"]')!
  for (const [type, clientX] of [
    ['pointerdown', 500],
    ['pointermove', 0],
    ['pointerup', 0],
  ] as const)
    await act(() => {
      handle.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          pointerId: 1,
          clientX,
        }),
      )
    })
  // 900px row − 480px Room minimum.
  expect(rail.style.width).toBe('420px')
  await act(async () => root.unmount())
  host.remove()
})
