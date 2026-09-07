import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '#/components/ui/tooltip'
import { agentDefinitionsQueryKey } from '#/features/agents/use-agent-definitions'
import { MessageComposer } from './message-composer'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true
})

afterAll(async () => {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister()
})

test('room mention menu is not nested inside the overflow-hidden composer chrome', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(agentDefinitionsQueryKey, [
    {
      id: 'antboy',
      name: 'Antboy',
      description: 'Sweat the small stuff',
      includeRepository: false,
      capabilities: [],
      skills: [],
    },
  ])
  const root = createRoot(host)

  await act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MessageComposer
            value=""
            onChange={() => undefined}
            onSubmit={async () => true}
            disabled={false}
            roomName="general"
            mentionableAccounts={[]}
            appearance="room"
          />
        </TooltipProvider>
      </QueryClientProvider>,
    )
  })

  const mentionButton = host.querySelector<HTMLButtonElement>(
    '[aria-label="Mention a teammate or agent"]',
  )
  expect(mentionButton).toBeTruthy()
  await act(() => {
    mentionButton!.click()
  })

  const menu = host.querySelector('.mention-menu')
  expect(menu).toBeTruthy()
  expect(menu!.closest('.room-composer')).toBeNull()
  expect(host.textContent).toContain('Antboy')

  await act(() => {
    root.unmount()
  })
  host.remove()
})
