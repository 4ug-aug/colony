import { EditorContent, useEditor } from '@tiptap/react'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { AtSign, Bold, Code, Italic, List, Send } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from '#/components/ui/button'

const agents = [
  {
    id: 'software-engineer',
    label: 'software-engineer',
    name: 'Software engineer',
    description: 'Build, debug, and review code',
  },
]

function suggestionMenu(mentionOpen: { current: boolean }) {
  let popup: HTMLDivElement | undefined
  let selected = 0
  let current:
    | {
        items: typeof agents
        command: (item: (typeof agents)[number]) => void
        clientRect?: (() => DOMRect | null) | null
      }
    | undefined
  const render = (props: {
    items: typeof agents
    command: (item: (typeof agents)[number]) => void
    clientRect?: (() => DOMRect | null) | null
  }) => {
    current = props
    if (!popup) return
    popup.replaceChildren(
      ...props.items.map((agent, index) => {
        const option = document.createElement('button')
        option.type = 'button'
        option.className = index === selected ? 'is-selected' : ''
        option.setAttribute('role', 'option')
        option.setAttribute('aria-selected', String(index === selected))
        const icon = document.createElement('span')
        icon.className = 'mention-menu-icon'
        icon.textContent = '</>'
        const copy = document.createElement('span')
        const name = document.createElement('strong')
        name.textContent = agent.name
        const description = document.createElement('small')
        description.textContent = agent.description
        copy.append(name, description)
        option.append(icon, copy)
        option.onmousedown = (event) => {
          event.preventDefault()
          props.command(agent)
        }
        return option
      }),
    )
    const rect = props.clientRect?.()
    if (rect) {
      const gap = 6
      const top =
        rect.bottom + gap + popup.offsetHeight < window.innerHeight
          ? rect.bottom + gap
          : rect.top - popup.offsetHeight - gap
      popup.style.left = `${Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8)}px`
      popup.style.top = `${Math.max(8, top)}px`
    }
  }
  return {
    onStart(props: Parameters<typeof render>[0]) {
      popup = document.createElement('div')
      popup.className = 'mention-menu'
      popup.setAttribute('role', 'listbox')
      popup.setAttribute('aria-label', 'Agents')
      document.body.appendChild(popup)
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
      popup?.remove()
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
  }
>(function MessageComposer(
  { value, onChange, onSubmit, disabled, roomName },
  ref,
) {
  const mentionOpen = useRef(false)
  const roomNameRef = useRef(roomName)
  useEffect(() => { roomNameRef.current = roomName }, [roomName])
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
            agents.filter((agent) => agent.label.includes(query.toLowerCase())),
          render: () => suggestionMenu(mentionOpen),
        },
      }),
      Placeholder.configure({ placeholder: () => `Message #${roomNameRef.current}` }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: 'min-h-20 px-1 py-1 text-sm leading-6 outline-none',
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
    <>
      <EditorContent editor={editor} />
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
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
            aria-label="Mention an agent"
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
    </>
  )
})
