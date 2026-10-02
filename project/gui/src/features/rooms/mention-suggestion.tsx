import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import Mention from '@tiptap/extension-mention'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { ReactNodeViewProps } from '@tiptap/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
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

/* One highlight glides to the selected row instead of each row toggling its
 * own background. Hover moves the selection so Enter picks what you see. */
function MentionMenu({
  items,
  selected,
  query,
  command,
  hover,
}: {
  items: MentionItem[]
  selected: number
  query: string
  command: (item: MentionItem) => void
  hover: (index: number) => void
}) {
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const row = rows.current[selected]
    setBox(row ? { top: row.offsetTop, height: row.offsetHeight } : null)
  }, [selected, items.length])
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1 rounded-md bg-muted transition-[top,height,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
        style={{
          top: box?.top ?? 0,
          height: box?.height ?? 0,
          opacity: box ? 1 : 0,
        }}
      />
      {items.map((item, index) => (
        <button
          key={`${item.kind}-${item.id}`}
          ref={(el) => {
            rows.current[index] = el
          }}
          type="button"
          role="option"
          aria-selected={index === selected}
          className="relative flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left"
          onMouseEnter={() => hover(index)}
          onMouseDown={(event) => {
            event.preventDefault()
            command(item)
          }}
        >
          <span className="flex size-5.5 shrink-0 items-center justify-center">
            {item.kind === 'agent' ? (
              <AgentMark agentId={item.id} className="size-5.5" />
            ) : (
              <AccountFace
                name={item.faceName ?? item.name}
                image={item.image}
                className="size-5.5 text-[10px]"
              />
            )}
          </span>
          <span className="shrink-0 text-[12.5px] font-medium">
            {item.name}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {item.description}
          </span>
        </button>
      ))}
      {items.length === 0 && (
        <div className="flex h-9 items-center px-2 text-xs text-muted-foreground">
          No matches for “{query}”
        </div>
      )}
      <div className="mt-1 border-t px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground">
        Type to search people & agents
      </div>
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

// Hide while TipTap is still loading or nothing is typed yet; once there is a
// query with no hits, show the "No matches" row instead.
const isEmpty = (props: SuggestionRenderProps) =>
  props.items.length === 0 && (Boolean(props.loading) || !props.query)

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
          query={props.query ?? ''}
          command={props.command}
          hover={(index) => {
            selected = index
            paint(props)
          }}
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
    popup.className =
      'mention-menu absolute inset-x-0 bottom-full z-50 mb-2 origin-bottom animate-in rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-md duration-150 fade-in zoom-in-95 motion-reduce:animate-none'
    popup.hidden = isEmpty(props)
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
      popup.hidden = isEmpty(next)
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
