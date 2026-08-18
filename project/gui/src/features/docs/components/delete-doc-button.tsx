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
import { Button } from '#/components/ui/button'
import { toast } from '#/components/ui/toast'
import { Trash2 } from 'lucide-react'
import type { Doc } from '../types'
import { useDeleteDoc } from '../use-docs'

export function DeleteDocButton({
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
