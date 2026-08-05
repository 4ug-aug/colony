import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { toast } from '#/components/ui/toast'
import type { IssueStatus } from './types'
import { ISSUE_STATUS_LABEL } from './types'
import { useCreateIssue } from './use-issues'

export function IssueCreateDialog({
  open,
  onOpenChange,
  defaultStatus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultStatus?: IssueStatus
}) {
  const createIssue = useCreateIssue()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const reset = () => {
    setTitle('')
    setDescription('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      await createIssue.mutateAsync({
        title: trimmed,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(defaultStatus ? { status: defaultStatus } : {}),
      })
      reset()
      onOpenChange(false)
      toast.add({ type: 'success', title: 'Issue created' })
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not create issue',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>New issue</DialogTitle>
            <DialogDescription>
              {defaultStatus
                ? `Creates in ${ISSUE_STATUS_LABEL[defaultStatus]}.`
                : 'Creates in Backlog by default.'}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 space-y-3">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Issue title"
              aria-label="Issue title"
              required
              maxLength={500}
              autoFocus
            />
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description (optional)"
              aria-label="Issue description"
              maxLength={10_000}
            />
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || createIssue.isPending}
            >
              {createIssue.isPending ? 'Creating…' : 'Create issue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
