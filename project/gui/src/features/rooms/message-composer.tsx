import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type ReactNodeViewProps,
} from '@tiptap/react'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import {
  AtSign,
  Bold,
  Code,
  Italic,
  List,
  Paperclip,
  Send,
  X,
} from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AccountFace } from '#/components/avatar'
import { Button } from '#/components/ui/button'
import { AgentMark, AgentMentionChip } from '#/features/agents/agent-mark'
import { isAgentMentionId } from '#/features/agents/agent-color'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import type { MentionableAccount } from './types'
import { formatBytes } from './format'

type MentionItem = {
  id: string
  label: string
  name: string
  description: string
  kind: 'account' | 'agent'
  image?: string
  faceName?: string
}

function isLiveEditor(
  editor: { isDestroyed: boolean; schema?: unknown } | null | undefined,
): boolean {
  return Boolean(editor && !editor.isDestroyed && editor.schema)
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

const ComposerMention = Mention.extend({
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

const previewTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])
const previewExtensions = /\.(?:png|jpe?g|gif|webp)$/i

function SelectedFile({
  file,
  disabled,
  sending,
  remove,
}: {
  file: File
  disabled: boolean
  sending: boolean
  remove: () => void
}) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (
      !previewTypes.has(file.type.toLowerCase()) &&
      !previewExtensions.test(file.name)
    )
      return
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
      setUrl(undefined)
    }
  }, [file])
  return (
    <div className="flex">
      <div className="flex flex-col items-center rounded-md bg-muted px-2 py-1 text-xs max-w-full align-middle">
        {url && (
          <div className="mb-1 w-full rounded overflow-hidden flex justify-center items-center">
            <img
              src={url}
              alt=""
              className="w-full h-24 object-cover rounded border"
              aria-hidden="true"
              style={{ objectFit: 'cover' }}
            />
          </div>
        )}
        <div className="flex items-center gap-1 w-full">
          <span className="truncate">
            {file.name} ({formatBytes(file.size)})
          </span>
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            disabled={disabled || sending}
            onClick={remove}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

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

function suggestionMenu(
  mentionOpen: { current: boolean },
  container: { current: HTMLDivElement | null },
) {
  let popup: HTMLDivElement | undefined
  let root: Root | undefined
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
    if (!root) return
    root.render(
      <MentionMenu
        items={props.items}
        selected={selected}
        command={props.command}
      />,
    )
  }
  return {
    onStart(props: Parameters<typeof render>[0]) {
      popup = document.createElement('div')
      popup.className = 'mention-menu'
      popup.setAttribute('role', 'listbox')
      popup.setAttribute('aria-label', 'People and agents')
      ;(container.current ?? document.body).appendChild(popup)
      root = createRoot(popup)
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
      const leavingRoot = root
      if (leaving) {
        leaving.classList.add('is-leaving')
        let removed = false
        const remove = () => {
          if (removed) return
          removed = true
          leavingRoot?.unmount()
          leaving.remove()
        }
        leaving.addEventListener('animationend', remove, { once: true })
        // Fallback in case the animation never fires (e.g. reduced motion).
        setTimeout(remove, 200)
      }
      popup = undefined
      root = undefined
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
    onSubmit: (value: string, files: File[]) => Promise<boolean>
    disabled: boolean
    roomName: string
    mentionableAccounts: MentionableAccount[]
    editing?: boolean
    onCancelEdit?: () => void
    hideMentions?: boolean
    hideAttachments?: boolean
    placeholder?: string
  }
>(function MessageComposer(
  {
    value,
    onChange,
    onSubmit,
    disabled,
    roomName,
    mentionableAccounts,
    editing = false,
    onCancelEdit,
    hideMentions = false,
    hideAttachments = false,
    placeholder,
  },
  ref,
) {
  const { data: agentDefinitions = [] } = useAgentDefinitions()
  const agents: MentionItem[] = agentDefinitions.map((agent) => ({
    id: agent.id,
    label: agent.id,
    name: agent.name,
    description: agent.description,
    kind: 'agent',
  }))
  const mentionOpen = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const filesRef = useRef<File[]>([])
  filesRef.current = files
  const [sending, setSending] = useState(false)
  const roomNameRef = useRef(roomName)
  const editingRef = useRef(editing)
  const placeholderRef = useRef(placeholder)
  placeholderRef.current = placeholder
  // TipTap onUpdate is sync, but React may re-render with a lagging `value`
  // (e.g. live room updates while typing fast). Re-applying that plain-text
  // value via setContent strips mention atoms — skip sync for our own emits.
  const skipNextValueSync = useRef(false)
  const mentionItems = useRef<MentionItem[]>([])
  mentionItems.current = hideMentions
    ? []
    : [
        ...mentionableAccounts.map((account) => {
          const username = account.username ?? account.name
          return {
            id: username,
            label: username,
            name: `@${username}`,
            description: account.displayName ?? 'Teammate',
            kind: 'account' as const,
            image: account.image,
            faceName: account.displayName ?? account.name,
          }
        }),
        ...agents,
      ]
  useEffect(() => {
    roomNameRef.current = roomName
  }, [roomName])
  useEffect(() => {
    editingRef.current = editing
  }, [editing])
  const serialize = () => (isLiveEditor(editor) ? editor.getText() : '')
  const addFiles = (next: FileList | File[]) => {
    if (disabled || sending || editing || hideAttachments) return
    setFiles((current) => [...current, ...Array.from(next)])
  }
  const submit = async () => {
    const text = serialize()
    const selectedFiles = editing ? [] : filesRef.current
    if ((!text.trim() && !selectedFiles.length) || disabled || sending) return
    setSending(true)
    try {
      if (await onSubmit(text, selectedFiles)) {
        setFiles([])
        if (isLiveEditor(editor)) editor.commands.clearContent()
      }
    } finally {
      setSending(false)
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
      }),
      ComposerMention.configure({
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
          editingRef.current
            ? 'Edit your message…'
            : (placeholderRef.current ??
              `Message #${roomNameRef.current} or mention someone…`),
      }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          'min-h-12 max-h-40 overflow-y-auto px-1 py-1 text-sm leading-6 outline-none',
        'aria-label': placeholderRef.current ?? `Message #${roomName}`,
      },
      handleKeyDown: (_, event) => {
        if (mentionOpen.current) return false
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          void submit()
          return true
        }
        return false
      },
      handlePaste: (_, event) => {
        if (event.clipboardData?.files.length)
          addFiles(event.clipboardData.files)
        return false
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      if (!isLiveEditor(updatedEditor)) return
      skipNextValueSync.current = true
      onChange(updatedEditor.getText())
    },
  })
  const editorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!isLiveEditor(currentEditor)) {
        return {
          hasText: false,
          bold: false,
          italic: false,
          bulletList: false,
          code: false,
        }
      }
      return {
        hasText: Boolean(currentEditor.getText().trim()),
        bold: currentEditor.isActive('bold'),
        italic: currentEditor.isActive('italic'),
        bulletList: currentEditor.isActive('bulletList'),
        code: currentEditor.isActive('code'),
      }
    },
  })

  useImperativeHandle(
    ref,
    () => ({
      mention(agentId) {
        const agent = agents.find(({ id }) => id === agentId)
        if (!agent || !isLiveEditor(editor)) return
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
    [editor, agents],
  )

  useEffect(() => {
    if (!isLiveEditor(editor)) return
    if (skipNextValueSync.current) {
      skipNextValueSync.current = false
      return
    }
    if (editor.getText() !== value)
      editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  useEffect(() => {
    if (!isLiveEditor(editor)) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (!isLiveEditor(editor)) return
    editor.view.dispatch(editor.state.tr)
  }, [editor, roomName, editing])

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
      {editing && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
          <span>Editing message</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onCancelEdit}
            disabled={disabled || sending}
          >
            Cancel
          </Button>
        </div>
      )}
      <EditorContent
        editor={editor}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          if (editing || !event.dataTransfer.files.length) return
          event.preventDefault()
          addFiles(event.dataTransfer.files)
        }}
      />
      {!editing && files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {files.map((file, index) => (
            <SelectedFile
              key={`${file.name}-${file.size}-${index}`}
              file={file}
              disabled={disabled}
              sending={sending}
              remove={() =>
                setFiles((current) =>
                  current.filter((_, item) => item !== index),
                )
              }
            />
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <div className="flex items-center gap-0.5 text-muted-foreground">
          {control(
            'Bold',
            editorState.bold,
            () => editor.chain().focus().toggleBold().run(),
            Bold,
          )}
          {control(
            'Italic',
            editorState.italic,
            () => editor.chain().focus().toggleItalic().run(),
            Italic,
          )}
          {control(
            'Bullet list',
            editorState.bulletList,
            () => editor.chain().focus().toggleBulletList().run(),
            List,
          )}
          {control(
            'Inline code',
            editorState.code,
            () => editor.chain().focus().toggleCode().run(),
            Code,
          )}
          {!hideMentions && (
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
          )}
          {!editing && !hideAttachments && (
            <>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="sr-only"
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files)
                  event.target.value = ''
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Attach files"
                onClick={() => fileInput.current?.click()}
                disabled={disabled || sending}
              >
                <Paperclip />
              </Button>
            </>
          )}
        </div>
        <Button
          type="button"
          size="icon-sm"
          className="rounded-full"
          aria-label={
            sending
              ? editing
                ? 'Saving message'
                : 'Sending message'
              : editing
                ? 'Save message'
                : 'Send message'
          }
          onClick={() => void submit()}
          disabled={
            (!editorState.hasText && !files.length) || disabled || sending
          }
        >
          {sending ? editing ? 'Saving…' : 'Sending…' : <Send />}
        </Button>
      </div>
    </div>
  )
})
