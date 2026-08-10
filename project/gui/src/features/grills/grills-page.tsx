import { Badge } from '#/components/ui/badge'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '#/components/ui/pagination'
import type { RunState } from '#/features/runs/run-helpers'
import { Flame } from 'lucide-react'
import { useDeferredValue, useState, type MouseEvent } from 'react'
import { DiscardGrillButton } from './discard-grill-button'
import {
  EMPTY_GRILL_FILTERS,
  GRILL_PAGE_SIZE,
  grillDisplayTitle,
  grillFiltersActive,
  type GrillListFilters,
} from './grill-filters'
import { GrillFiltersBar } from './grill-filters-bar'
import { grillStepLabel } from './grill-presentation'
import { GrillSession } from './grill-session'
import { grillListStatus } from './grill-status'
import { StartGrillDialog } from './start-grill-dialog'
import type { GrillListItem } from './types'
import { useGrills } from './use-grills'

export { GrillSessionHeader } from './grill-session'

function GrillListActivity({ grill }: { grill: GrillListItem }) {
  const status = grillListStatus(grill)
  const linkedRun = grill.linkedRun
  const openCount = grill.frontier.questions.length

  if (status === 'your_turn') {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {openCount > 0 ? `${openCount} open` : null}
        <Badge variant="secondary">your turn</Badge>
      </span>
    )
  }

  if (status === 'complete') {
    return (
      <span className="shrink-0 text-xs text-muted-foreground">complete</span>
    )
  }

  if (status === 'in_progress') {
    const state = linkedRun?.state as RunState | undefined
    const stepStatus = grill.latestStep
      ? grillStepLabel(grill.latestStep)
      : state === 'preparing'
        ? 'is preparing'
        : 'waiting for frontier'
    return (
      <BrailleLoader
        loader="wave-rows"
        text={stepStatus}
        className="shrink-0 max-w-[11rem] text-xs [&_span:last-child]:truncate"
      />
    )
  }

  if (status === 'failed') {
    const state = linkedRun?.state as RunState | undefined
    const error = linkedRun?.error?.trim() || state
    return (
      <span
        className="min-w-0 max-w-[11rem] shrink truncate text-xs text-destructive"
        title={error}
      >
        {error}
      </span>
    )
  }

  return (
    <span className="shrink-0 text-xs text-muted-foreground">
      {grill.settledAnswers.length} settled
    </span>
  )
}

function pageItems(page: number, pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }
  if (page <= 3) return [1, 2, 3, 4, 'ellipsis', pageCount]
  if (page >= pageCount - 2) {
    return [
      1,
      'ellipsis',
      pageCount - 3,
      pageCount - 2,
      pageCount - 1,
      pageCount,
    ]
  }
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', pageCount]
}

function GrillListPagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}) {
  if (pageCount <= 1) return null

  const goTo = (next: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    onPageChange(next)
  }

  return (
    <Pagination className="mx-0 w-auto justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            text=""
            className="size-8 px-0"
            aria-disabled={page <= 1}
            tabIndex={page <= 1 ? -1 : undefined}
            onClick={
              page <= 1 ? (event) => event.preventDefault() : goTo(page - 1)
            }
          />
        </PaginationItem>
        {pageItems(page, pageCount).map((item, index) =>
          item === 'ellipsis' ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink
                href="#"
                size="icon-sm"
                isActive={item === page}
                onClick={goTo(item)}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            href="#"
            text=""
            className="size-8 px-0"
            aria-disabled={page >= pageCount}
            tabIndex={page >= pageCount ? -1 : undefined}
            onClick={
              page >= pageCount
                ? (event) => event.preventDefault()
                : goTo(page + 1)
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

export function GrillsPage({
  startOpen = false,
  onStartOpenChange,
  selectedId,
  onSelectedIdChange,
  onOpenDoc,
}: {
  startOpen?: boolean
  onStartOpenChange?: (open: boolean) => void
  selectedId?: string
  onSelectedIdChange?: (id: string | undefined) => void
  onOpenDoc?: (docId: string) => void
}) {
  const [internalSelectedId, setInternalSelectedId] = useState<string>()
  const selectedControlled = onSelectedIdChange !== undefined
  const activeId = selectedControlled ? selectedId : internalSelectedId
  const setActiveId = selectedControlled
    ? onSelectedIdChange
    : setInternalSelectedId
  const [internalStartOpen, setInternalStartOpen] = useState(false)
  const startOpenControlled = onStartOpenChange !== undefined
  const dialogOpen = startOpenControlled ? startOpen : internalStartOpen
  const setDialogOpen = startOpenControlled
    ? onStartOpenChange
    : setInternalStartOpen
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<GrillListFilters>(EMPTY_GRILL_FILTERS)
  const [page, setPage] = useState(1)
  const deferredSearch = useDeferredValue(search)

  const setSearchAndResetPage = (value: string) => {
    setSearch(value)
    setPage(1)
  }
  const setFiltersAndResetPage = (value: GrillListFilters) => {
    setFilters(value)
    setPage(1)
  }

  const listQuery = {
    page,
    pageSize: GRILL_PAGE_SIZE,
    search: deferredSearch,
    filters,
  }
  const { data, isPending, isError, error, isFetching } = useGrills(listQuery, {
    enabled: !activeId,
  })

  if (activeId) {
    return <GrillSession grillId={activeId} onOpenDoc={onOpenDoc} />
  }

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <BrailleLoader text="Loading Grills…" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Unable to load Grills'}
      </div>
    )
  }

  const grills = data?.grills ?? []
  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? GRILL_PAGE_SIZE
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  if (page > pageCount) {
    setPage(pageCount)
  }
  const safePage = Math.min(page, pageCount)
  const filtersActive = grillFiltersActive(filters, search)
  const emptyWorkspace = !filtersActive && total === 0
  const rangeStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeEnd = Math.min(safePage * pageSize, total)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        {emptyWorkspace ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Flame className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No active Grills</p>
              <p className="text-sm text-muted-foreground">
                Use Enter the Grill in the header to start one.
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`mx-auto flex max-w-6xl flex-col overflow-hidden rounded-xl border bg-card ${
              isFetching ? 'opacity-90' : ''
            }`}
          >
            <div className="border-b px-3 py-2.5">
              <GrillFiltersBar
                search={search}
                filters={filters}
                onSearchChange={setSearchAndResetPage}
                onFiltersChange={setFiltersAndResetPage}
              />
            </div>
            {total === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No Grills match your search or filters.
                </p>
                {filtersActive ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => {
                      setSearchAndResetPage('')
                      setFiltersAndResetPage(EMPTY_GRILL_FILTERS)
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="divide-y">
                {grills.map((grill) => (
                  <li key={grill.id}>
                    <div className="flex items-stretch gap-1 transition-colors hover:bg-muted/40">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start justify-between gap-3 px-4 py-3 text-left"
                        onClick={() => setActiveId(grill.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {grillDisplayTitle(grill)}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="font-normal">
                              {grill.kind === 'code' ? 'Code' : 'General'}
                            </Badge>
                            <Badge variant="secondary" className="font-normal">
                              {grill.visibility === 'workspace-open'
                                ? 'Workspace open'
                                : 'Invite only'}
                            </Badge>
                            {grill.issueProposal ? (
                              <Badge variant="outline" className="font-normal">
                                proposal {grill.issueProposal.status}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <GrillListActivity grill={grill} />
                      </button>
                      <div className="flex shrink-0 items-start p-2">
                        <DiscardGrillButton
                          grillId={grill.id}
                          size="icon-sm"
                          stopPropagation
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {total === 0
                  ? 'Showing 0 of 0'
                  : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
              </p>
              <GrillListPagination
                page={safePage}
                pageCount={pageCount}
                onPageChange={setPage}
              />
            </div>
          </div>
        )}
      </div>
      <StartGrillDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onStarted={(grill) => setActiveId(grill.id)}
      />
    </div>
  )
}
