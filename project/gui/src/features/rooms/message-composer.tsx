import { EditorContent, useEditor } from '@tiptap/react'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { AtSign, Bold, Code, Italic, List, Send } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from '#/components/ui/button'
import type { MentionableAccount } from './types'

type MentionItem = {
  id: string
  label: string
  name: string
  description: string
  kind: 'account' | 'agent'
}

const agents: MentionItem[] = [
  {
    id: 'software-engineer',
    label: 'software-engineer',
    name: 'Software engineer',
    description: 'Build, debug, and review code',
    kind: 'agent',
  },
]

function suggestionMenu(
  mentionOpen: { current: boolean },
  container: { current: HTMLDivElement | null },
) {
  let popup: HTMLDivElement | undefined
  let selected = 0
  let current:
    | {
        items: MentionItem[]
        command: (item: MentionItem) => void
        clientRect?: (() => DOMRect | null) | null
      }
    | undefined
  const render = (props: {
    items: MentionItem[]
    command: (item: MentionItem) => void
    clientRect?: (() => DOMRect | null) | null
  }) => {
    current = props
    if (!popup) return
    const groups = [
      { kind: 'account' as const, label: 'People' },
      { kind: 'agent' as const, label: 'Agents' },
    ].flatMap(({ kind, label }) => {
      const items = props.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.kind === kind)
      if (!items.length) return []
      const group = document.createElement('div')
      group.className = 'mention-menu-group'
      group.setAttribute('role', 'group')
      group.setAttribute('aria-label', label)
      const heading = document.createElement('div')
      heading.className = 'mention-menu-heading'
      heading.textContent = label
      heading.setAttribute('aria-hidden', 'true')
      group.append(
        heading,
        ...items.map(({ item, index }) => {
          const option = document.createElement('button')
          option.type = 'button'
          option.className = index === selected ? 'is-selected' : ''
          option.setAttribute('role', 'option')
          option.setAttribute('aria-selected', String(index === selected))
          const icon = document.createElement('span')
          icon.className = 'mention-menu-icon'
          icon.textContent = item.kind === 'agent' ? '</>' : '@'
          const copy = document.createElement('span')
          const name = document.createElement('strong')
          name.textContent = item.name
          const description = document.createElement('small')
          description.textContent = item.description
          copy.append(name, description)
          option.append(icon, copy)
          option.onmousedown = (event) => {
            event.preventDefault()
            props.command(item)
          }
          return option
        }),
      )
      return group
    })
    popup.replaceChildren(...groups)
  }
  return {
    onStart(props: Parameters<typeof render>[0]) {
      popup = document.createElement('div')
      popup.className = 'mention-menu'
      popup.setAttribute('role', 'listbox')
      popup.setAttribute('aria-label', 'People and agents')
      ;(container.current ?? document.body).appendChild(popup)
      render(props)
      mentionOpen.current = true
    },
    onUpdate(props: Parameters<typeof render>[0]) {
      selected = Math.min(selected, Math.max(0, props.items.length - 1))
      render(props)
    },
    onKeyDown({ event }: { event: KeyboardEvent }) {
      const props = current
      if (!props) return false
      if (!props.items.length) return false
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        selected =
          (selected +
            (event.key === 'ArrowDown' ? 1 : -1) +
            props.items.length) %
          props.items.length
        render(props)
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
      const leaving = popup
      if (leaving) {
        leaving.classList.add('is-leaving')
        const remove = () => leaving.remove()
        leaving.addEventListener('animationend', remove, { once: true })
        // Fallback in case the animation never fires (e.g. reduced motion).
        setTimeout(remove, 200)
      }
      popup = undefined
      selected = 0
      current = undefined
      mentionOpen.current = false
    },
  }
}

export type MessageComposerHandle = {
  mention: (agentId: string) => void
}

export const MessageComposer = forwardRef<
  MessageComposerHandle,
  {
    value: string
    onChange: (value: string) => void
    onSubmit: (value: string) => void
    disabled: boolean
    roomName: string
    mentionableAccounts: MentionableAccount[]
  }
>(function MessageComposer(
  { value, onChange, onSubmit, disabled, roomName, mentionableAccounts },
  ref,
) {
  const mentionOpen = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const roomNameRef = useRef(roomName)
  const mentionItems = useRef<MentionItem[]>([])
  mentionItems.current = [
    ...mentionableAccounts.map((account) => {
      const username = account.username ?? account.name
      return {
        id: username,
        label: username,
        name: `@${username}`,
        description: account.displayName ?? 'Teammate',
        kind: 'account' as const,
      }
    }),
    ...agents,
  ]
  useEffect(() => {
    roomNameRef.current = roomName
  }, [roomName])
  const serialize = () => editor.getText()
  const submit = () => {
    const text = serialize()
    if (text.trim()) onSubmit(text)
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
      }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        renderText: ({ node }) => `@${node.attrs.id}`,
        suggestion: {
          items: ({ query }) =>
            mentionItems.current.filter((item) =>
              item.label.toLowerCase().includes(query.toLowerCase()),
            ),
          render: () => suggestionMenu(mentionOpen, containerRef),
        },
      }),
      Placeholder.configure({
        placeholder: () =>
          `Message #${roomNameRef.current} or mention someone…`,
      }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          'min-h-12 max-h-40 overflow-y-auto px-1 py-1 text-sm leading-6 outline-none',
        'aria-label': `Message #${roomName}`,
      },
      handleKeyDown: (_, event) => {
        if (mentionOpen.current) return false
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          submit()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: updatedEditor }) => onChange(updatedEditor.getText()),
  })

  useImperativeHandle(
    ref,
    () => ({
      mention(agentId) {
        const agent = agents.find(({ id }) => id === agentId)
        if (!agent) return
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: 'mention',
              attrs: {
                id: agent.id,
                label: agent.label,
                mentionSuggestionChar: '@',
              },
            },
            { type: 'text', text: ' ' },
          ])
          .run()
      },
    }),
    [editor],
  )

  useEffect(() => {
    if (editor.getText() !== value)
      editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  useEffect(() => {
    editor.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (editor) editor.view.dispatch(editor.state.tr)
  }, [editor, roomName])

  const control = (
    label: string,
    active: boolean,
    command: () => void,
    Icon: typeof Bold,
  ): ReactNode => (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon-xs"
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={command}
      disabled={disabled}
    >
      <Icon />
    </Button>
  )

  return (
    <div ref={containerRef} className="relative">
      <EditorContent editor={editor} />
      <div className="mt-1.5 flex items-center justify-between">
        <div className="flex items-center gap-0.5 text-muted-foreground">
          {control(
            'Bold',
            editor.isActive('bold'),
            () => editor.chain().focus().toggleBold().run(),
            Bold,
          )}
          {control(
            'Italic',
            editor.isActive('italic'),
            () => editor.chain().focus().toggleItalic().run(),
            Italic,
          )}
          {control(
            'Bullet list',
            editor.isActive('bulletList'),
            () => editor.chain().focus().toggleBulletList().run(),
            List,
          )}
          {control(
            'Inline code',
            editor.isActive('code'),
            () => editor.chain().focus().toggleCode().run(),
            Code,
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Mention a teammate or agent"
            onClick={() => editor.chain().focus().insertContent('@').run()}
            disabled={disabled}
          >
            <AtSign />
          </Button>
        </div>
        <Button
          type="button"
          size="icon-sm"
          className="rounded-full"
          aria-label="Send message"
          onClick={submit}
          disabled={!value.trim() || disabled}
        >
          <Send />
        </Button>
      </div>
    </div>
  )
})
