import { Markdown } from '#/components/markdown'
import { Button } from '#/components/ui/button'
import { toast } from '#/components/ui/toast'
import { useDoc } from '#/features/docs/use-docs'
import { cn } from '#/lib/utils'
import { grillEnterClassName } from './grill-presentation'
import type { Grill } from './types'
import { useCompleteGrill } from './use-grills'

export function GrillWriteupPanel({
  grill,
  onOpenDoc,
}: {
  grill: Grill
  onOpenDoc?: (docId: string) => void
}) {
  const writeup = grill.writeup
  const complete = useCompleteGrill(grill.id)
  const { data: doc, isPending: docPending } = useDoc(grill.docId)

  if (grill.docId) {
    return (
      <div
        className={cn('space-y-3 rounded-lg border p-4', grillEnterClassName)}
      >
        <h3 className="text-sm font-semibold">Doc saved</h3>
        {docPending ? (
          <p className="text-sm text-muted-foreground">Loading Doc…</p>
        ) : doc ? (
          <>
            <p className="text-base font-medium">
              {doc.title.trim() || 'Untitled Doc'}
            </p>
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <Markdown>{doc.body}</Markdown>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            This General Grill writeup is saved as a workspace Doc.
          </p>
        )}
        {onOpenDoc ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenDoc(grill.docId!)}
          >
            Open in Docs
          </Button>
        ) : null}
      </div>
    )
  }

  if (!writeup) return null

  return (
    <div className={cn('space-y-3 rounded-lg border p-4', grillEnterClassName)}>
      <h3 className="text-sm font-semibold">Doc writeup</h3>
      <p className="text-base font-medium">{writeup.title}</p>
      <div className="max-h-[min(28rem,50vh)] overflow-auto rounded-md border bg-muted/20 px-3 py-2 text-sm">
        <Markdown>{writeup.body}</Markdown>
      </div>
      <Button
        type="button"
        disabled={complete.isPending || !writeup.title.trim()}
        onClick={() => {
          void complete
            .mutateAsync({
              title: writeup.title.trim(),
              body: writeup.body,
            })
            .catch((reason) => {
              toast.add({
                title:
                  reason instanceof Error
                    ? reason.message
                    : 'Unable to complete Grill',
                type: 'error',
              })
            })
        }}
      >
        {complete.isPending ? 'Saving Doc…' : 'Complete & save Doc'}
      </Button>
    </div>
  )
}
