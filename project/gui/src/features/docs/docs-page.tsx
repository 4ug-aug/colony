import { Markdown } from '#/components/markdown'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import { ArrowLeft, FileText } from 'lucide-react'
import type { Doc } from './types'
import { useDoc, useDocs } from './use-docs'

function formatDocUpdatedAt(updatedAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(updatedAt)
}

function DocDetail({
  docId,
  onBack,
}: {
  docId: string
  onBack: () => void
}) {
  const { data: doc, isPending, isError, error } = useDoc(docId)

  if (isPending && !doc) {
    return (
      <div className="flex h-full items-center justify-center">
        <BrailleLoader text="Loading Doc…" />
      </div>
    )
  }

  if (isError || !doc) {
    return (
      <div className="space-y-3 p-6">
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          Docs
        </Button>
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Doc not found'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <article className="mx-auto max-w-4xl space-y-4">
          <header className="space-y-1 border-b pb-4">
            <h1 className="text-xl font-semibold tracking-tight">
              {doc.title.trim() || 'Untitled Doc'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {doc.createdBy.name} · {formatDocUpdatedAt(doc.updatedAt)}
            </p>
          </header>
          {doc.body.trim() ? (
            <div className="text-sm leading-relaxed">
              <Markdown>{doc.body}</Markdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This Doc is empty.</p>
          )}
        </article>
      </div>
    </div>
  )
}

export function DocSessionHeader({
  docId,
  onBack,
}: {
  docId: string
  onBack: () => void
}) {
  const { data: doc, isPending } = useDoc(docId)

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" />
        Docs
      </Button>
      <p className="min-w-0 flex-1 truncate text-sm font-medium">
        {isPending && !doc
          ? 'Loading Doc…'
          : (doc?.title.trim() || 'Untitled Doc')}
      </p>
    </>
  )
}

function DocListItem({
  doc,
  onOpen,
}: {
  doc: Doc
  onOpen: (id: string) => void
}) {
  const preview = doc.body.trim().split('\n').find(Boolean) ?? 'Empty Doc'

  return (
    <li>
      <button
        type="button"
        className={cn(
          'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/40',
        )}
        onClick={() => onOpen(doc.id)}
      >
        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {doc.title.trim() || 'Untitled Doc'}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {preview}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {doc.createdBy.name} · {formatDocUpdatedAt(doc.updatedAt)}
          </p>
        </div>
      </button>
    </li>
  )
}

export function DocsPage({
  selectedId,
  onSelectedIdChange,
}: {
  selectedId?: string
  onSelectedIdChange?: (id: string | undefined) => void
}) {
  const { data: docs = [], isPending, isError, error } = useDocs()
  const ordered = [...docs].sort((a, b) => b.updatedAt - a.updatedAt)

  if (selectedId) {
    return (
      <DocDetail
        docId={selectedId}
        onBack={() => onSelectedIdChange?.(undefined)}
      />
    )
  }

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <BrailleLoader text="Loading Docs…" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Unable to load Docs'}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        {ordered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No Docs yet</p>
              <p className="text-sm text-muted-foreground">
                Complete a General Grill to persist a design writeup here.
              </p>
            </div>
          </div>
        ) : (
          <ul className="mx-auto grid max-w-4xl gap-2">
            {ordered.map((doc) => (
              <DocListItem
                key={doc.id}
                doc={doc}
                onOpen={(id) => onSelectedIdChange?.(id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
