import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from '#/components/ui/context-menu'
import { toast } from '#/components/ui/toast'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { formatIssueId } from './format'
import type { Issue } from './types'
import { useDeleteIssue } from './use-issues'

function IssueDeleteDialog({
  issue,
  open,
  onOpenChange,
  onDeleted,
}: {
  issue: Issue
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const deleteIssue = useDeleteIssue()
  const issueRef = formatIssueId(issue.number)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {issueRef}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes “{issue.title}”. Sub-issues are kept as
            top-level issues.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleteIssue.isPending}
            onClick={() => {
              void deleteIssue
                .mutateAsync(issue.id)
                .then(() => {
                  onOpenChange(false)
                  toast.add({
                    type: 'success',
                    title: 'Issue deleted',
                    description: `${issueRef} was permanently deleted.`,
                  })
                  onDeleted?.()
                })
                .catch((reason: unknown) => {
                  toast.add({
                    type: 'error',
                    title: 'Could not delete issue',
                    description:
                      reason instanceof Error
                        ? reason.message
                        : 'Please try again.',
                  })
                })
            }}
          >
            Delete issue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteMenuItems({ onDelete }: { onDelete: () => void }) {
  return (
    <ContextMenuContent>
      <ContextMenuGroup>
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          Delete issue
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  )
}

/** Right-click context menu for list rows. */
export function IssueDeleteContextMenu({
  issue,
  render,
  children,
  onDeleted,
}: {
  issue: Issue
  render: ReactElement
  children: ReactNode
  onDeleted?: () => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger render={render}>{children}</ContextMenuTrigger>
        <DeleteMenuItems onDelete={() => setConfirmOpen(true)} />
      </ContextMenu>
      <IssueDeleteDialog
        issue={issue}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onDeleted={onDeleted}
      />
    </>
  )
}

/** Actions button for the issue detail header. */
export function IssueDeleteButton({
  issue,
  onDeleted,
}: {
  issue: Issue
  onDeleted?: () => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Issue actions"
              onClick={() => setConfirmOpen(true)}
            />
          }
        >
          <MoreHorizontal />
        </ContextMenuTrigger>
        <DeleteMenuItems onDelete={() => setConfirmOpen(true)} />
      </ContextMenu>
      <IssueDeleteDialog
        issue={issue}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onDeleted={onDeleted}
      />
    </>
  )
}
