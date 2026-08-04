import { useEffect, useState } from 'react'
import { Hash } from 'lucide-react'
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectHit: (hit: MessageSearchHit) => void
}) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const search = useMessageSearch(query, open)
  const hits: MessageSearchHit[] = search.data ?? []
  const waiting =
    trimmed.length >= MESSAGE_SEARCH_MIN_QUERY_LENGTH &&
    (search.isFetching || search.isPending) &&
    hits.length === 0

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
      title="Search messages"
      description="Search across rooms"
    >
      <Command shouldFilter={false} loop>
        <CommandInput
          placeholder="Search messages…"
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
              <CommandEmpty>No messages found.</CommandEmpty>
              {hits.length > 0 && (
                <CommandGroup heading="Messages">
                  {hits.map((hit) => (
                    <CommandItem
                      key={`${hit.roomId}:${hit.messageId}`}
                      value={`${hit.roomId}:${hit.messageId}:${hit.text}`}
                      className="items-start [&>svg:last-child]:hidden"
                      onSelect={() => {
                        onSelectHit(hit)
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
