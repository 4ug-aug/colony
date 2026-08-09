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
import { useDiscardGrill } from './use-grills'

export function DiscardGrillButton({
  grillId,
  onDiscarded,
  size = 'sm',
  stopPropagation,
}: {
  grillId: string
  onDiscarded?: () => void
  size?: 'sm' | 'icon-sm'
  stopPropagation?: boolean
}) {
  const discard = useDiscardGrill()

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            size={size}
            variant="ghost"
            aria-label="Discard Grill"
            onClick={
              stopPropagation ? (event) => event.stopPropagation() : undefined
            }
          />
        }
      >
        <Trash2 data-icon={size === 'sm' ? 'inline-start' : undefined} />
        {size === 'sm' ? 'Discard' : null}
      </AlertDialogTrigger>
      <AlertDialogContent
        onClick={
          stopPropagation ? (event) => event.stopPropagation() : undefined
        }
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Discard this Grill?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the session, settled rounds, and any linked
            agent run. Confirmed Issues and saved Docs are kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={discard.isPending}
            onClick={() => {
              void discard
                .mutateAsync(grillId)
                .then(() => {
                  onDiscarded?.()
                })
                .catch((reason) => {
                  toast.add({
                    title:
                      reason instanceof Error
                        ? reason.message
                        : 'Unable to discard Grill',
                    type: 'error',
                  })
                })
            }}
          >
            {discard.isPending ? 'Discarding…' : 'Discard'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
