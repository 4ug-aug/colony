import { toast } from '#/components/ui/toast'
import type { KeyboardEvent } from 'react'
import { useState } from 'react'
import { formatTimeSpentMinutes } from '../format'
import { railTriggerClass } from './property-picker'
import type { Issue } from '../types'
import { useUpdateIssue } from '../use-issues'

export function TimeSpentEditor({ issue }: { issue: Issue }) {
  const updateIssue = useUpdateIssue()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const total = issue.timeSpent.reduce((sum, minutes) => sum + minutes, 0)

  const beginEdit = () => {
    setDraft(total > 0 ? String(total) : '')
    setEditing(true)
  }

  const save = async () => {
    const trimmed = draft.trim()
    const minutes = Number(trimmed)
    const next =
      trimmed === '' || !Number.isFinite(minutes) || minutes <= 0
        ? []
        : [Math.round(minutes)]
    const same =
      next.length === issue.timeSpent.length &&
      next.every((value, index) => value === issue.timeSpent[index])
    if (same) {
      setEditing(false)
      return
    }
    try {
      await updateIssue.mutateAsync({ id: issue.id, timeSpent: next })
      setEditing(false)
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not update time spent',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void save()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        type="number"
        min={0}
        step={1}
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={onKeyDown}
        className="h-8 w-24 rounded-sm border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label="Time spent in minutes"
        disabled={updateIssue.isPending}
      />
    )
  }

  return (
    <button
      type="button"
      className={railTriggerClass}
      onClick={beginEdit}
      aria-label="Edit time spent"
    >
      {total > 0 ? formatTimeSpentMinutes(total) : '—'}
    </button>
  )
}
