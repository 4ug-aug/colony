import { Button } from '#/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '#/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { toast } from '#/components/ui/toast'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { IssueLabelChip, LabelDot } from './issue-labels'
import { LabelCheck } from './property-picker'
import type { Issue } from '../types'
import { useIssues, useUpdateIssue } from '../use-issues'

export function TagsEditor({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const updateIssue = useUpdateIssue()
  const { data: issues = [] } = useIssues()

  const knownTags = [
    ...new Set(issues.flatMap((candidate) => candidate.tags)),
  ].sort((a, b) => a.localeCompare(b))

  const selected = new Set(issue.tags)
  const selectedTags = issue.tags
  const availableTags = knownTags.filter((tag) => !selected.has(tag))
  const trimmed = query.trim()
  const canCreate =
    trimmed.length > 0 &&
    !knownTags.some((tag) => tag.toLowerCase() === trimmed.toLowerCase())

  const setTags = async (tags: string[]) => {
    try {
      await updateIssue.mutateAsync({ id: issue.id, tags })
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not update labels',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  const toggle = (tag: string) => {
    void setTags(
      selected.has(tag)
        ? issue.tags.filter((current) => current !== tag)
        : [...issue.tags, tag],
    )
  }

  const create = () => {
    if (!canCreate) return
    void setTags([...issue.tags, trimmed])
    setQuery('')
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Labels</h3>
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) setQuery('')
          }}
        >
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground"
                aria-label="Change or add labels"
              />
            }
          >
            <Plus className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            <Command shouldFilter>
              <CommandInput
                placeholder="Change or add labels…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                <CommandEmpty>
                  {canCreate ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={create}
                      disabled={updateIssue.isPending}
                    >
                      Create “{trimmed}”
                    </button>
                  ) : (
                    'No labels found.'
                  )}
                </CommandEmpty>
                {selectedTags.length > 0 && (
                  <CommandGroup>
                    {selectedTags.map((tag) => (
                      <CommandItem
                        key={`selected:${tag}`}
                        value={tag}
                        onSelect={() => toggle(tag)}
                        disabled={updateIssue.isPending}
                      >
                        <LabelCheck checked />
                        <LabelDot tag={tag} />
                        <span className="min-w-0 flex-1 truncate">{tag}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {selectedTags.length > 0 &&
                  (availableTags.length > 0 || canCreate) && (
                    <CommandSeparator />
                  )}
                {(availableTags.length > 0 || canCreate) && (
                  <CommandGroup>
                    {availableTags.map((tag) => (
                      <CommandItem
                        key={tag}
                        value={tag}
                        onSelect={() => toggle(tag)}
                        disabled={updateIssue.isPending}
                      >
                        <LabelCheck checked={false} />
                        <LabelDot tag={tag} />
                        <span className="min-w-0 flex-1 truncate">{tag}</span>
                      </CommandItem>
                    ))}
                    {canCreate && (
                      <CommandItem
                        value={`create-${trimmed}`}
                        onSelect={create}
                        disabled={updateIssue.isPending}
                      >
                        <LabelCheck checked={false} />
                        <LabelDot tag={trimmed} />
                        <span className="min-w-0 flex-1 truncate">
                          Create “{trimmed}”
                        </span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedTags.map((tag) => (
            <IssueLabelChip key={tag} tag={tag} className="max-w-full" />
          ))}
        </div>
      )}
    </div>
  )
}
