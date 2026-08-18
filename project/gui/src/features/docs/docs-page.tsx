import { BrailleLoader } from '#/components/ui/braille-loader'
import { FileText } from 'lucide-react'
import { DocListItem } from './components/doc-list-item'
import { DocDetail } from './components/doc-session'
import { useDocs } from './use-docs'

export { DocSessionHeader } from './components/doc-session'

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
