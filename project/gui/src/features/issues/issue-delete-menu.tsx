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
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '#/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { toast } from '#/components/ui/toast'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { formatIssueDeepLink } from '#/lib/issue-deep-link'
import { Copy, Link, MoreHorizontal, Trash2 } from 'lucide-react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { formatIssueId, formatIssueMarkdown } from './format'
import type { Issue } from './types'
import { useDeleteIssue } from './use-issues'
import { useWorkspaceMembers } from './use-workspace-members'

async function copyText(text: string, successTitle: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ type: 'success', title: successTitle })
  } catch {
    toast.add({ type: 'error', title: 'Copy failed' })
  }
}

function useCopyIssueMarkdown(issue: Issue) {
  const { data: agents = [] } = useAgentDefinitions()
  const { data: members = [] } = useWorkspaceMembers()
  return () => {
    const assignee = (() => {
      if (!issue.owner) return '—'
      if (issue.owner.kind === 'agent')
        return agentNameFrom(agents, issue.owner.id)
      const member = members.find((user) => user.id === issue.owner!.id)
      return member?.displayName || member?.name || issue.owner.id
    })()
    return copyText(
      formatIssueMarkdown(issue, { assignee }),
      'Copied as markdown',
    )
  }
}

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

function IssueMenuItems({
  issue,
  onDelete,
}: {
  issue: Issue
  onDelete: () => void
}) {
  const copyMarkdown = useCopyIssueMarkdown(issue)
  return (
    <ContextMenuContent>
      <ContextMenuGroup>
        <ContextMenuItem onClick={() => void copyMarkdown()}>
          <Copy />
          Copy as markdown
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() =>
            void copyText(formatIssueDeepLink(issue.number), 'Copied deeplink')
          }
        >
          <Link />
          Copy deeplink
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
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
        <IssueMenuItems
          issue={issue}
          onDelete={() => setConfirmOpen(true)}
        />
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
  const copyMarkdown = useCopyIssueMarkdown(issue)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Issue actions"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => void copyMarkdown()}>
              <Copy />
              Copy as markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                void copyText(
                  formatIssueDeepLink(issue.number),
                  'Copied deeplink',
                )
              }
            >
              <Link />
              Copy deeplink
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 />
              Delete issue
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <IssueDeleteDialog
        issue={issue}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onDeleted={onDeleted}
      />
    </>
  )
}
