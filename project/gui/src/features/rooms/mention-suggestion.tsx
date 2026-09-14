import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Mention from '@tiptap/extension-mention'
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react'
import { createRoot, type Root } from 'react-dom/client'
import { AccountFace } from '#/components/avatar'
import { AgentMark, AgentMentionChip } from '#/features/agents/agent-mark'
import { isAgentMentionId } from '#/features/agents/agent-color'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'

export type MentionItem = {
  id: string
  label: string
  name: string
  description: string
  kind: 'account' | 'agent'
  image?: string
  faceName?: string
}

function ComposerMentionView({ node }: ReactNodeViewProps) {
  const id = String(node.attrs.id ?? '')
  const { data: agents = [] } = useAgentDefinitions()
  const isAgent = isAgentMentionId(
    id,
    agents.map((agent) => agent.id),
  )
  return (
    <NodeViewWrapper as="span">
      {isAgent ? (
        <AgentMentionChip agentId={id} label={agentNameFrom(agents, id)} />
      ) : (
        <>@{node.attrs.label ?? id}</>
      )}
    </NodeViewWrapper>
  )
}

export const ComposerMention = Mention.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ComposerMentionView, {
      as: 'span',
      className: 'mention',
      attrs: ({ node }) => {
        const mentionId = node.attrs.id
        return {
          'data-type': 'mention',
          ...(mentionId ? { 'data-id': String(mentionId) } : {}),
        }
      },
    })
  },
})

function MentionMenu({
  items,
  selected,
  command,
}: {
  items: MentionItem[]
  selected: number
  command: (item: MentionItem) => void
}) {
  const groups = [
    { kind: 'account' as const, label: 'People' },
    { kind: 'agent' as const, label: 'Agents' },
  ]
  return (
    <>
      {groups.map(({ kind, label }) => {
        const rows = items
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.kind === kind)
        if (!rows.length) return null
        return (
          <div
            key={kind}
            className="mention-menu-group"
            role="group"
            aria-label={label}
          >
            <div className="mention-menu-heading" aria-hidden="true">
              {label}
            </div>
            {rows.map(({ item, index }) => (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                role="option"
                aria-selected={index === selected}
                className={index === selected ? 'is-selected' : ''}
                onMouseDown={(event) => {
                  event.preventDefault()
                  command(item)
                }}
              >
                {item.kind === 'agent' ? (
                  <AgentMark agentId={item.id} className="shrink-0" />
                ) : (
                  <AccountFace
                    name={item.faceName ?? item.name}
                    image={item.image}
                    className="size-6 shrink-0 text-xs"
                  />
                )}
                <span className="mention-menu-copy">
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            ))}
          </div>
        )
      })}
    </>
  )
}

type SuggestionRenderProps = {
  items: MentionItem[]
  command: (item: MentionItem) => void
  clientRect?: (() => DOMRect | null) | null
  loading?: boolean
  query?: string
  text?: string
}

export function suggestionMenu(
  mentionOpen: { current: boolean },
  container: { current: HTMLDivElement | null },
  queryClient: QueryClient,
  itemsFor?: (query: string) => MentionItem[],
): {
  onStart: (props: SuggestionRenderProps) => void
  onUpdate: (props: SuggestionRenderProps) => void
  onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean
  onExit: () => void
} {
  let popup: HTMLDivElement | undefined
  let root: Root | undefined
  let selected = 0
  let current: SuggestionRenderProps | undefined
  const dismiss = () => {
    root?.unmount()
    popup?.remove()
    popup = undefined
    root = undefined
    selected = 0
    current = undefined
    mentionOpen.current = false
  }
  const withItems = (props: SuggestionRenderProps): SuggestionRenderProps => {
    if (props.items.length || !itemsFor) return props
    return { ...props, items: itemsFor(props.query ?? ''), loading: false }
  }
  const paint = (props: SuggestionRenderProps) => {
    current = props
    if (!root) return
    // Detached createRoot does not inherit the app QueryClient; AgentMark needs one.
    root.render(
      <QueryClientProvider client={queryClient}>
        <MentionMenu
          items={props.items}
          selected={selected}
          command={props.command}
        />
      </QueryClientProvider>,
    )
  }
  const mount = (props: SuggestionRenderProps) => {
    if (popup) {
      root?.unmount()
      popup.remove()
      root = undefined
      popup = undefined
    }
    popup = document.createElement('div')
    popup.className = 'mention-menu'
    popup.hidden = props.items.length === 0
    popup.setAttribute('role', 'listbox')
    popup.setAttribute('aria-label', 'People and agents')
    ;(container.current ?? document.body).appendChild(popup)
    root = createRoot(popup)
    selected = Math.min(selected, Math.max(0, props.items.length - 1))
    mentionOpen.current = true
    paint(props)
  }
  return {
    onStart(props) {
      mount(withItems(props))
    },
    onUpdate(props) {
      if (!mentionOpen.current) return
      // Opening often arrives as `{ text: '', loading: true }`. Only close
      // once TipTap has finished loading and the trigger is actually gone.
      if (!props.loading && props.text === '') {
        dismiss()
        return
      }
      // TipTap clears items and sets loading on every keystroke while it
      // re-fetches. Keep the current list so typing @ and filtering stay snappy.
      if (props.loading) return
      const next = withItems(props)
      selected = Math.min(selected, Math.max(0, next.items.length - 1))
      if (!popup) {
        mount(next)
        return
      }
      popup.hidden = next.items.length === 0
      paint(next)
    },
    onKeyDown({ event }: { event: KeyboardEvent }) {
      const props = current
      if (!props) return false
      // Backspace/Delete of the bare "@" runs before TipTap's async view
      // update, so close here or the list stays on screen.
      if (
        (event.key === 'Backspace' || event.key === 'Delete') &&
        !props.query
      ) {
        dismiss()
        return false
      }
      if (!props.items.length) return false
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        selected =
          (selected +
            (event.key === 'ArrowDown' ? 1 : -1) +
            props.items.length) %
          props.items.length
        paint(props)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        props.command(props.items[selected])
        return true
      }
      if (event.key === 'Escape') return true
      return false
    },
    onExit() {
      dismiss()
    },
  }
}
