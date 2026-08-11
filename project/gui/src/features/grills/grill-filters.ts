import {
  GRILL_LIST_STATUS_LABEL,
  GRILL_LIST_STATUSES,
  type GrillListStatus,
} from './grill-status'
import type { GrillKind, GrillListItem, GrillVisibility } from './types'

export const GRILL_KINDS = ['code', 'general'] as const satisfies readonly GrillKind[]
export const GRILL_VISIBILITIES = [
  'workspace-open',
  'invite-only',
] as const satisfies readonly GrillVisibility[]

export const GRILL_KIND_LABEL: Record<GrillKind, string> = {
  code: 'Code',
  general: 'General',
}

export const GRILL_VISIBILITY_LABEL: Record<GrillVisibility, string> = {
  'workspace-open': 'Workspace open',
  'invite-only': 'Invite only',
}

export type GrillListFilters = {
  statuses: GrillListStatus[]
  kinds: GrillKind[]
  visibilities: GrillVisibility[]
}

export const EMPTY_GRILL_FILTERS: GrillListFilters = {
  statuses: [],
  kinds: [],
  visibilities: [],
}

export const GRILL_PAGE_SIZE = 10

export {
  GRILL_LIST_STATUSES,
  GRILL_LIST_STATUS_LABEL,
  type GrillListStatus,
}

export function grillFiltersActive(
  filters: GrillListFilters,
  search = '',
): boolean {
  return (
    search.trim().length > 0 ||
    filters.statuses.length > 0 ||
    filters.kinds.length > 0 ||
    filters.visibilities.length > 0
  )
}

export function grillDisplayTitle(grill: GrillListItem): string {
  const request = grill.initialRequest?.trim()
  if (request) return request
  return grill.kind === 'code' ? 'Code Grill' : 'General Grill'
}

export type GrillListQueryParams = {
  page: number
  pageSize: number
  search: string
  filters: GrillListFilters
}

export function toGrillListSearchParams(
  params: GrillListQueryParams,
): URLSearchParams {
  const searchParams = new URLSearchParams()
  searchParams.set('page', String(params.page))
  searchParams.set('pageSize', String(params.pageSize))
  const search = params.search.trim()
  if (search) searchParams.set('search', search)
  if (params.filters.kinds.length > 0) {
    searchParams.set('kinds', params.filters.kinds.join(','))
  }
  if (params.filters.visibilities.length > 0) {
    searchParams.set('visibilities', params.filters.visibilities.join(','))
  }
  if (params.filters.statuses.length > 0) {
    searchParams.set('statuses', params.filters.statuses.join(','))
  }
  return searchParams
}
