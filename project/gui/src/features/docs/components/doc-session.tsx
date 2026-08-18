import { Markdown } from '#/components/markdown'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { formatDocUpdatedAt } from '../format'
import { useDoc } from '../use-docs'
import { DeleteDocButton } from './delete-doc-button'

export function DocDetail({
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
