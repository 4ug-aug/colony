import { useQueryClient } from '@tanstack/react-query'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { ArrowUp, AtSign, Paperclip, Plus, X } from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Button } from '#/components/ui/button'
import {
  ComposerMention,
  suggestionMenu,
} from '#/features/rooms/mention-suggestion'
import type { MentionItem } from '#/features/rooms/mention-suggestion'
import { formatBytes } from '#/features/rooms/format'
import { cn } from '#/lib/utils'

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
  remove,
}: {
  file: File
  disabled: boolean
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
    <span className="flex h-7 max-w-56 animate-in items-center gap-1.5 rounded-md bg-muted py-1 pr-1 pl-1.5 text-xs text-muted-foreground zoom-in-95 fade-in">
      {url ? (
        <img
          src={url}
          alt=""
          aria-hidden="true"
          className="size-5 shrink-0 rounded-sm object-cover"
        />
      ) : (
        <Paperclip className="size-3.5 shrink-0" />
      )}
      <span className="truncate">
        {file.name} ({formatBytes(file.size)})
      </span>
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        className="flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-background hover:text-foreground"
        disabled={disabled}
        onClick={remove}
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

export type PromptBarHandle = {
  insertMention: (item: MentionItem) => void
}

/* Inline layout: [+] [editor] [send]. Once the text would wrap (or there are
 * several blocks / attachments) the editor takes the full first row and the
 * controls drop to a second row. */
export const PromptBar = forwardRef<
  PromptBarHandle,
  {
    value: string
    onChange: (value: string) => void
    onSubmit: (value: string, files: File[]) => Promise<boolean>
    disabled: boolean
    placeholder: string
    /** Omit to turn mentions off entirely. */
    mentionItems?: MentionItem[]
    attachments?: boolean
    editing?: boolean
    onCancelEdit?: () => void
  }
>(function PromptBar(
  {
    value,
    onChange,
    onSubmit,
    disabled,
    placeholder,
    mentionItems,
    attachments = false,
    editing = false,
    onCancelEdit,
  },
  ref,
) {
  const queryClient = useQueryClient()
  const mentions = mentionItems !== undefined
  const mentionOpen = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLSpanElement | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const filesRef = useRef<File[]>([])
  filesRef.current = files
  const [sending, setSending] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const editingRef = useRef(editing)
  const placeholderRef = useRef(placeholder)
  placeholderRef.current = placeholder
  // TipTap onUpdate is sync, but React may re-render with a lagging `value`
  // (e.g. live room updates while typing fast). Re-applying that plain-text
  // value via setContent strips mention atoms — skip sync for our own emits.
  const skipNextValueSync = useRef(false)
  const mentionItemsRef = useRef<MentionItem[]>([])
  mentionItemsRef.current = mentionItems ?? []
  const canAttach = attachments && !editing
  useEffect(() => {
    editingRef.current = editing
  }, [editing])
  const serialize = () => (isLiveEditor(editor) ? editor.getText() : '')
  const addFiles = (next: FileList | File[]) => {
    if (disabled || sending || !canAttach) return
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
    mentionItemsRef.current.filter((item) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
      }),
      ...(mentions
        ? [
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
          ]
        : []),
      Placeholder.configure({
        placeholder: () =>
          editingRef.current ? 'Edit your message…' : placeholderRef.current,
      }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          'min-h-7 max-h-[100px] overflow-y-auto px-1 py-0.5 text-sm leading-6 outline-none cursor-text [overflow-wrap:anywhere]',
        'aria-label': placeholderRef.current,
      },
      handleKeyDown: (_, event) => {
        if (mentionOpen.current || event.isComposing) return false
        if (event.key === 'Escape') {
          setPlusOpen(false)
          return false
        }
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
      setPlusOpen(false)
    },
  })
  const editorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!isLiveEditor(currentEditor)) return { text: '', multiBlock: false }
      const doc = currentEditor.state.doc
      return {
        text: currentEditor.getText(),
        multiBlock:
          doc.childCount > 1 || doc.firstChild?.type.name !== 'paragraph',
      }
    },
  })

  /* Measure the text on one line against the width the inline editor would
   * get; comparing against the inline width (not the current one) keeps the
   * layout from flip-flopping at the boundary. */
  useLayoutEffect(() => {
    const grid = gridRef.current
    const measure = measureRef.current
    if (!grid || !measure) return
    const inlineWidth = grid.clientWidth - 28 * 2 - 4 * 2 - 8
    const next =
      editorState.multiBlock ||
      files.length > 0 ||
      measure.offsetWidth > inlineWidth
    if (next !== expanded) setExpanded(next)
  }, [editorState.text, editorState.multiBlock, files.length, expanded])

  useImperativeHandle(
    ref,
    () => ({
      insertMention(item) {
        if (!isLiveEditor(editor)) return
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: 'mention',
              attrs: {
                id: item.id,
                label: item.label,
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
  }, [editor, placeholder, editing])

  useEffect(() => {
    if (!plusOpen) return
    const close = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node))
        setPlusOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [plusOpen])

  const canSend =
    (Boolean(editorState.text.trim()) || files.length > 0) &&
    !disabled &&
    !sending
  const sendAriaLabel = sending
    ? editing
      ? 'Saving message'
      : 'Sending message'
    : editing
      ? 'Save message'
      : 'Send message'
  const plusItems = [
    canAttach && {
      label: 'Add files',
      Icon: Paperclip,
      run: () => fileInput.current?.click(),
    },
    mentions && {
      label: 'Mention a teammate or agent',
      Icon: AtSign,
      run: () => editor.chain().focus().insertContent('@').run(),
    },
  ].filter((item) => item !== false)

  return (
    <div ref={containerRef} className="relative">
      {plusOpen && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-60 origin-bottom-left animate-in rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-md zoom-in-95 fade-in"
        >
          {plusItems.map(({ label, Icon, run }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setPlusOpen(false)
                run()
              }}
            >
              <Icon className="size-4 text-muted-foreground" />
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5 rounded-[14px] border bg-background p-1.5 shadow-sm transition-[border-color,box-shadow] duration-150 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
        <span
          ref={measureRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute text-sm whitespace-pre"
        >
          {editorState.text}
        </span>
        {editing && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
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
        {canAttach && files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-0.5 pt-0.5">
            {files.map((file, index) => (
              <SelectedFile
                key={`${file.name}-${file.size}-${index}`}
                file={file}
                disabled={disabled || sending}
                remove={() =>
                  setFiles((current) =>
                    current.filter((_, item) => item !== index),
                  )
                }
              />
            ))}
          </div>
        )}
        <div
          ref={gridRef}
          className="grid grid-cols-[28px_minmax(0,1fr)_28px] items-end gap-x-1 gap-y-1.5"
        >
          {plusItems.length > 0 && (
            <button
              type="button"
              aria-label="Add attachments and mentions"
              aria-haspopup="menu"
              aria-expanded={plusOpen}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setPlusOpen((open) => !open)}
              className={cn(
                'flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.94] disabled:pointer-events-none',
                plusOpen && 'bg-muted text-foreground',
                expanded
                  ? 'col-start-1 row-start-2'
                  : 'col-start-1 row-start-1',
              )}
            >
              <Plus className="size-4" strokeWidth={2} />
            </button>
          )}
          <EditorContent
            editor={editor}
            className={
              expanded
                ? 'col-span-full row-start-1 min-w-0'
                : cn(
                    'row-start-1 min-w-0',
                    plusItems.length > 0 ? 'col-start-2' : 'col-span-2',
                  )
            }
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              if (!canAttach || !event.dataTransfer.files.length) return
              event.preventDefault()
              addFiles(event.dataTransfer.files)
            }}
          />
          <button
            type="button"
            aria-label={sendAriaLabel}
            aria-busy={sending || undefined}
            disabled={!canSend}
            onClick={() => void submit()}
            className={cn(
              'col-start-3 flex size-7 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94]',
              canSend
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground',
              expanded ? 'row-start-2' : 'row-start-1',
            )}
          >
            <ArrowUp className="size-4" strokeWidth={2.4} />
          </button>
        </div>
      </div>
      {canAttach && (
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
      )}
    </div>
  )
})
