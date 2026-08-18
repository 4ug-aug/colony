import { FileText } from 'lucide-react'
import { formatDocUpdatedAt } from '../format'
import type { Doc } from '../types'
import { DeleteDocButton } from './delete-doc-button'

export function DocListItem({
  doc,
  onOpen,
}: {
  doc: Doc
  onOpen: (id: string) => void
}) {
  const preview = doc.body.trim().split('\n').find(Boolean) ?? 'Empty Doc'

  return (
    <li>
      <div className="flex items-stretch gap-1 rounded-lg border transition-colors hover:bg-muted/40 bg-card">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left cursor-pointer"
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
