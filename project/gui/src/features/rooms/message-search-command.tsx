import { useEffect, useRef, useState } from 'react'
import { Cuboid, Hash } from 'lucide-react'
import { timestamp } from '#/components/avatar'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import type { MessageSearchHit } from './types'
import { searchIssues } from '#/features/issues/issue-filters'
import { formatIssueId } from '#/features/issues/format'
import { IssueStatusIcon } from '#/features/issues/issue-icons'
import type { Issue } from '#/features/issues/types'
import { useIssues } from '#/features/issues/use-issues'
import {
  MESSAGE_SEARCH_MIN_QUERY_LENGTH,
  useMessageSearch,
} from './use-message-search'

function truncate(text: string, max = 120) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

export function MessageSearchCommand({
  open,
  onOpenChange,
  onSelectHit,
  onSelectIssue,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectHit: (hit: MessageSearchHit) => void
  onSelectIssue: (issue: Issue) => void
}) {
  const [query, setQuery] = useState('')
  const pendingSelection = useRef<
    | { kind: 'message'; hit: MessageSearchHit }
    | { kind: 'issue'; issue: Issue }
    | undefined
  >(undefined)
  const trimmed = query.trim()
  const search = useMessageSearch(query, open)
  const hits: MessageSearchHit[] = search.data ?? []
  const issuesQuery = useIssues({ enabled: open })
  const issues = searchIssues(issuesQuery.data ?? [], trimmed).slice(0, 20)
  const waiting =
    trimmed.length >= MESSAGE_SEARCH_MIN_QUERY_LENGTH &&
    (search.isFetching || search.isPending || issuesQuery.isPending) &&
    hits.length === 0 &&
    issues.length === 0

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k')
        return
      if (event.altKey || event.shiftKey) return
      event.preventDefault()
      onOpenChange(!open)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpenChange, open])

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setQuery('')
      }}
      onOpenChangeComplete={() => {
        const selection = pendingSelection.current
        pendingSelection.current = undefined
        if (!selection) return
        if (selection.kind === 'issue') onSelectIssue(selection.issue)
        else onSelectHit(selection.hit)
      }}
      title="Search Colony"
      description="Search messages and Issues"
    >
      <Command shouldFilter={false} loop>
        <CommandInput
          placeholder="Search messages and Issues…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {trimmed.length < MESSAGE_SEARCH_MIN_QUERY_LENGTH ? (
            <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>
          ) : waiting && !hits.length ? (
            <CommandEmpty>Searching…</CommandEmpty>
          ) : (
            <>
              <CommandEmpty>No messages or Issues found.</CommandEmpty>
              {issues.length > 0 && (
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-2">
                      <Cuboid className="size-3.5" />
                      Issues
                    </span>
                  }
                >
                  {issues.map((issue) => (
                    <CommandItem
                      key={issue.id}
                      value={`${formatIssueId(issue.number)}:${issue.title}:${issue.description}`}
                      className="items-start [&>svg:last-child]:hidden"
                      onSelect={() => {
                        pendingSelection.current = { kind: 'issue', issue }
                        onOpenChange(false)
                        setQuery('')
                      }}
                    >
                      <IssueStatusIcon status={issue.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="shrink-0 font-medium">
                            {formatIssueId(issue.number)}
                          </span>
                          <span className="truncate">{issue.title}</span>
                        </div>
                        {issue.description && (
                          <p className="truncate text-muted-foreground">
                            {truncate(issue.description)}
                          </p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {hits.length > 0 && (
                <CommandGroup heading="Messages">
                  {hits.map((hit) => (
                    <CommandItem
                      key={`${hit.roomId}:${hit.messageId}`}
                      value={`${hit.roomId}:${hit.messageId}:${hit.text}`}
                      className="items-start [&>svg:last-child]:hidden"
                      onSelect={() => {
                        pendingSelection.current = { kind: 'message', hit }
                        onOpenChange(false)
                        setQuery('')
                      }}
                    >
                      <Hash className="size-3.5 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate font-medium">
                            {hit.roomName}
                          </span>
                          <span className="truncate text-muted-foreground">
                            {hit.author.name}
                          </span>
                          <span className="ml-auto shrink-0 text-[0.625rem] text-muted-foreground">
                            {timestamp(hit.createdAt)}
                          </span>
                        </div>
                        <p className="truncate text-muted-foreground">
                          {truncate(hit.text)}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
