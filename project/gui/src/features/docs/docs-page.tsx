import { Markdown } from '#/components/markdown'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import { toast } from '#/components/ui/toast'
import { ArrowLeft, FileText, Trash2 } from 'lucide-react'
import type { Doc } from './types'
import { useDeleteDoc, useDoc, useDocs } from './use-docs'

function formatDocUpdatedAt(updatedAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(updatedAt)
}

function DeleteDocButton({
  doc,
  onDeleted,
  size = 'sm',
  stopPropagation,
}: {
  doc: Doc
  onDeleted?: () => void
  size?: 'sm' | 'icon-sm'
  stopPropagation?: boolean
}) {
  const deleteDoc = useDeleteDoc()
  const title = doc.title.trim() || 'Untitled Doc'

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            size={size}
            variant="ghost"
            aria-label={`Delete ${title}`}
            onClick={
              stopPropagation
                ? (event) => event.stopPropagation()
                : undefined
            }
          />
        }
      >
        <Trash2 data-icon={size === 'sm' ? 'inline-start' : undefined} />
        {size === 'sm' ? 'Delete' : null}
      </AlertDialogTrigger>
      <AlertDialogContent
        onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this Doc?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes “{title}”. Grills that produced it are
            kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleteDoc.isPending}
            onClick={() => {
              void deleteDoc
                .mutateAsync(doc.id)
                .then(() => {
                  onDeleted?.()
                })
                .catch((reason) => {
                  toast.add({
                    title:
                      reason instanceof Error
                        ? reason.message
                        : 'Unable to delete Doc',
                    type: 'error',
                  })
                })
            }}
          >
            {deleteDoc.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
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
          <header className="border-b pb-4">
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
      {doc ? <DeleteDocButton doc={doc} onDeleted={onBack} /> : null}
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
      <div className="flex items-stretch gap-1 rounded-lg border transition-colors hover:bg-muted/40">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left"
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
        <div className="flex shrink-0 items-start p-2">
          <DeleteDocButton doc={doc} size="icon-sm" stopPropagation />
        </div>
      </div>
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
