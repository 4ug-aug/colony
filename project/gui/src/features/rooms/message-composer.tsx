import { useQueryClient } from '@tanstack/react-query'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
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
import { Button } from '#/components/ui/button'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import {
  ComposerMention,
  suggestionMenu,
  type MentionItem,
} from './mention-suggestion'
import type { MentionableAccount } from './types'
import { formatBytes } from './format'

function isLiveEditor(
  editor: { isDestroyed: boolean; schema?: unknown } | null | undefined,
): boolean {
  return Boolean(editor && !editor.isDestroyed && editor.schema)
}

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
      <div className="flex max-w-full flex-col items-center rounded-md bg-muted px-2 py-1 text-xs align-middle">
        {url && (
          <div className="mb-1 flex w-full items-center justify-center overflow-hidden rounded">
            <img
              src={url}
              alt=""
              className="h-24 w-full rounded border object-cover"
              aria-hidden="true"
            />
          </div>
        )}
        <div className="flex w-full items-center gap-1">
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

function ComposerTool({
  label,
  pressed,
  onClick,
  disabled,
  Icon,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  disabled: boolean
  Icon: typeof Bold
}) {
  return (
    <Button
      type="button"
      variant={pressed ? 'secondary' : 'ghost'}
      size="icon-xs"
      aria-label={label}
      aria-pressed={pressed}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon />
    </Button>
  )
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
  const queryClient = useQueryClient()
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

  const itemsForQuery = (query: string) =>
    mentionItems.current.filter((item) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    )

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
          items: ({ query }) => itemsForQuery(query),
          render: () =>
            suggestionMenu(
              mentionOpen,
              containerRef,
              queryClient,
              itemsForQuery,
            ),
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
          'min-h-8 max-h-40 overflow-y-auto text-sm leading-6 outline-none cursor-text',
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

  const sendAriaLabel = sending
    ? editing
      ? 'Saving message'
      : 'Sending message'
    : editing
      ? 'Save message'
      : 'Send message'

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl border bg-background p-2.5"
    >
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
          <ComposerTool
            label="Bold"
            pressed={editorState.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={disabled}
            Icon={Bold}
          />
          <ComposerTool
            label="Italic"
            pressed={editorState.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={disabled}
            Icon={Italic}
          />
          <ComposerTool
            label="Bullet list"
            pressed={editorState.bulletList}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            disabled={disabled}
            Icon={List}
          />
          <ComposerTool
            label="Inline code"
            pressed={editorState.code}
            onClick={() => editor.chain().focus().toggleCode().run()}
            disabled={disabled}
            Icon={Code}
          />
          {!hideMentions && (
            <ComposerTool
              label="Mention a teammate or agent"
              onClick={() => editor.chain().focus().insertContent('@').run()}
              disabled={disabled}
              Icon={AtSign}
            />
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
              <ComposerTool
                label="Attach files"
                onClick={() => fileInput.current?.click()}
                disabled={disabled || sending}
                Icon={Paperclip}
              />
            </>
          )}
        </div>
        <Button
          type="button"
          size="icon-sm"
          className="rounded-full"
          aria-label={sendAriaLabel}
          aria-busy={sending || undefined}
          onClick={() => void submit()}
          disabled={
            (!editorState.hasText && !files.length) || disabled || sending
          }
        >
          <Send />
        </Button>
      </div>
    </div>
  )
})
