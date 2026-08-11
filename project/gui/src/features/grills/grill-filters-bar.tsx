import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { cn } from '#/lib/utils'
import { ChevronDown, Search, X } from 'lucide-react'
import {
  EMPTY_GRILL_FILTERS,
  GRILL_KIND_LABEL,
  GRILL_KINDS,
  GRILL_LIST_STATUS_LABEL,
  GRILL_LIST_STATUSES,
  GRILL_VISIBILITY_LABEL,
  GRILL_VISIBILITIES,
  grillFiltersActive,
  type GrillListFilters,
  type GrillListStatus,
} from './grill-filters'
import type { GrillKind, GrillVisibility } from './types'

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((current) => current !== value)
    : [...values, value]
}

function filterTriggerClass(active: boolean) {
  return cn(
    'h-7 gap-1 px-2 text-xs font-medium text-muted-foreground',
    active && 'bg-muted text-foreground',
  )
}

function StatusFilter({
  selected,
  onChange,
}: {
  selected: GrillListStatus[]
  onChange: (statuses: GrillListStatus[]) => void
}) {
  const active = selected.length > 0
  const label =
    selected.length === 0
      ? 'Status'
      : selected.length === 1
        ? GRILL_LIST_STATUS_LABEL[selected[0]!]
        : `Status  ${selected.length}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={filterTriggerClass(active)}
          />
        }
      >
        {label}
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {GRILL_LIST_STATUSES.map((status) => (
          <DropdownMenuCheckboxItem
            key={status}
            checked={selected.includes(status)}
            onCheckedChange={() => onChange(toggleValue(selected, status))}
          >
            {GRILL_LIST_STATUS_LABEL[status]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function KindFilter({
  selected,
  onChange,
}: {
  selected: GrillKind[]
  onChange: (kinds: GrillKind[]) => void
}) {
  const active = selected.length > 0
  const label =
    selected.length === 0
      ? 'Kind'
      : selected.length === 1
        ? GRILL_KIND_LABEL[selected[0]!]
        : `Kind  ${selected.length}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={filterTriggerClass(active)}
          />
        }
      >
        {label}
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36">
        {GRILL_KINDS.map((kind) => (
          <DropdownMenuCheckboxItem
            key={kind}
            checked={selected.includes(kind)}
            onCheckedChange={() => onChange(toggleValue(selected, kind))}
          >
            {GRILL_KIND_LABEL[kind]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function VisibilityFilter({
  selected,
  onChange,
}: {
  selected: GrillVisibility[]
  onChange: (visibilities: GrillVisibility[]) => void
}) {
  const active = selected.length > 0
  const label =
    selected.length === 0
      ? 'Visibility'
      : selected.length === 1
        ? GRILL_VISIBILITY_LABEL[selected[0]!]
        : `Visibility  ${selected.length}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={filterTriggerClass(active)}
          />
        }
      >
        {label}
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {GRILL_VISIBILITIES.map((visibility) => (
          <DropdownMenuCheckboxItem
            key={visibility}
            checked={selected.includes(visibility)}
            onCheckedChange={() =>
              onChange(toggleValue(selected, visibility))
            }
          >
            {GRILL_VISIBILITY_LABEL[visibility]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function GrillFiltersBar({
  search,
  filters,
  onSearchChange,
  onFiltersChange,
}: {
  search: string
  filters: GrillListFilters
  onSearchChange: (search: string) => void
  onFiltersChange: (filters: GrillListFilters) => void
}) {
  const active = grillFiltersActive(filters, search)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[12rem] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search Grills…"
          className="h-8 pl-8 text-sm"
          aria-label="Search Grills"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <StatusFilter
          selected={filters.statuses}
          onChange={(statuses) => onFiltersChange({ ...filters, statuses })}
        />
        <KindFilter
          selected={filters.kinds}
          onChange={(kinds) => onFiltersChange({ ...filters, kinds })}
        />
        <VisibilityFilter
          selected={filters.visibilities}
          onChange={(visibilities) =>
            onFiltersChange({ ...filters, visibilities })
          }
        />
        {active ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => {
              onSearchChange('')
              onFiltersChange(EMPTY_GRILL_FILTERS)
            }}
          >
            <X className="size-3.5" />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  )
}
