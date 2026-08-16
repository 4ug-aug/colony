import { Plus, Trash2, X } from 'lucide-react'
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { useWorkspaceMembers } from '#/features/issues/use-workspace-members'
import { accountFaceStyle, accountInitials } from '#/lib/account-color'
import { cn } from '#/lib/utils'
import type { Poll } from './types'

const maxPollOptions = 8
export const emptyPoll = (): Poll => ({ options: ['', ''], votes: {} })

/**
 * Keeps focus inside the editing card when a control is clicked, so the card's
 * focusout commit doesn't fire mid-edit.
 */
export const keepFocus = (event: { preventDefault: () => void }) =>
  event.preventDefault()

/** Drops blank options; a poll needs two to survive a commit. */
export function normalizePoll(poll: Poll | null): Poll | null {
  if (!poll) return null
  const options = poll.options.map((option) => option.trim()).filter(Boolean)
  if (options.length < 2) return null
  return { ...poll, options }
}

/** Voters per option, ignoring indexes left dangling by an edited option list. */
function tally(poll: Poll): string[][] {
  const buckets: string[][] = poll.options.map(() => [])
  for (const [userId, chosen] of Object.entries(poll.votes))
    for (const index of chosen) buckets[index]?.push(userId)
  return buckets
}

export function PollResults({
  poll,
  currentUserId,
  onVote,
}: {
  poll: Poll
  currentUserId: string
  onVote: (options: number[] | null) => void
}) {
  const { data: members = [] } = useWorkspaceMembers()
  const byId = new Map(members.map((member) => [member.id, member]))
  const buckets = tally(poll)
  const mine = poll.votes[currentUserId] ?? []
  const voterCount = Object.values(poll.votes).filter(
    (chosen) => chosen.length > 0,
  ).length

  const select = (index: number) => {
    if (!poll.multi) {
      onVote(mine.includes(index) ? null : [index])
      return
    }
    const next = mine.includes(index)
      ? mine.filter((item) => item !== index)
      : [...mine, index]
    onVote(next.length ? next : null)
  }

  return (
    <div className="flex flex-col gap-1 px-3 pb-3">
      {poll.options.map((option, index) => {
        const voters = buckets[index] ?? []
        const chosen = mine.includes(index)
        const percent = voterCount ? (voters.length / voterCount) * 100 : 0
        return (
          <button
            key={index}
            type="button"
            aria-pressed={chosen}
            onClick={() => select(index)}
            className={cn(
              'relative flex items-center gap-2 overflow-hidden rounded-md border border-border/70 px-2 py-1.5 text-left text-sm transition-colors hover:border-border',
              chosen && 'border-primary/60',
            )}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-muted"
              style={{ width: `${percent}%` }}
            />
            <span className="relative flex-1 truncate">{option}</span>
            {voters.length > 0 && (
              <AvatarGroup className="relative">
                {voters.slice(0, 3).map((userId) => {
                  const member = byId.get(userId)
                  const name = member?.name || 'Someone'
                  return (
                    <Avatar key={userId} size="sm" title={name}>
                      {member?.image && <AvatarImage src={member.image} />}
                      <AvatarFallback
                        className="text-[10px] font-semibold"
                        style={accountFaceStyle(name, member?.color)}
                      >
                        {accountInitials(name)}
                      </AvatarFallback>
                    </Avatar>
                  )
                })}
                {voters.length > 3 && (
                  <AvatarGroupCount className="size-6 text-xs">
                    +{voters.length - 3}
                  </AvatarGroupCount>
                )}
              </AvatarGroup>
            )}
            <span className="relative w-4 text-right tabular-nums text-muted-foreground">
              {voters.length}
            </span>
          </button>
        )
      })}
      <p className="px-0.5 text-xs text-muted-foreground">
        {voterCount === 1 ? '1 vote' : `${voterCount} votes`}
        {poll.multi ? ' · multiple choice' : ''}
      </p>
    </div>
  )
}

export function PollEditor({
  poll,
  onChange,
  onRemove,
}: {
  poll: Poll
  onChange: (poll: Poll) => void
  onRemove: () => void
}) {
  const voteCount = Object.values(poll.votes).filter(
    (chosen) => chosen.length > 0,
  ).length
  const setOption = (index: number, value: string) => {
    onChange({
      ...poll,
      options: poll.options.map((option, at) =>
        at === index ? value : option,
      ),
    })
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-border/70 p-3">
      {poll.options.map((option, index) => (
        <div key={index} className="flex items-center gap-1">
          <Input
            value={option}
            placeholder={`Option ${index + 1}`}
            className="h-7 text-sm"
            onChange={(event) => setOption(index, event.currentTarget.value)}
          />
          {poll.options.length > 2 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove option ${index + 1}`}
              onMouseDown={keepFocus}
              onClick={() =>
                onChange({
                  ...poll,
                  options: poll.options.filter((_, at) => at !== index),
                })
              }
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={poll.options.length >= maxPollOptions}
          onMouseDown={keepFocus}
          onClick={() => onChange({ ...poll, options: [...poll.options, ''] })}
        >
          <Plus className="size-3.5" />
          Add option
        </Button>
        {/* The whole row is the hit target — a bare <label> around Checkbox
            does not forward clicks, since the root renders a span. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={poll.multi ?? false}
          className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none hover:text-foreground"
          onMouseDown={keepFocus}
          onClick={() => onChange({ ...poll, multi: !poll.multi })}
        >
          <Checkbox
            checked={poll.multi ?? false}
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none"
          />
          Multiple choice
        </button>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start text-muted-foreground hover:text-destructive"
        onMouseDown={keepFocus}
        onClick={onRemove}
      >
        <Trash2 className="size-3.5" />
        {voteCount > 0
          ? `Remove poll and ${voteCount === 1 ? '1 vote' : `${voteCount} votes`}`
          : 'Remove poll'}
      </Button>
    </div>
  )
}
