import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  type IssueOwner,
  type IssuePriority,
  type IssueStatus,
} from './issue-model'
import type { IssueUpdate } from './issue-store'

export type IssueBodyError = { error: string }

export type ParsedIssueCreate = {
  title: string
  description: string
  status?: IssueStatus
  priority?: IssuePriority
  tags?: string[]
  timeSpent?: number[]
  parentId?: string
  owner?: IssueOwner
}

export type ParsedIssuePatch = IssueUpdate

const isStatus = (value: unknown): value is IssueStatus =>
  typeof value === 'string' &&
  (ISSUE_STATUSES as readonly string[]).includes(value)

const isPriority = (value: unknown): value is IssuePriority =>
  typeof value === 'string' &&
  (ISSUE_PRIORITIES as readonly string[]).includes(value)

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((tag) => typeof tag === 'string')

const isFiniteNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.every(
    (minutes) => typeof minutes === 'number' && Number.isFinite(minutes),
  )

export function parseOwner(
  value: unknown,
): IssueOwner | undefined | false {
  if (value === null) return undefined
  if (!value || typeof value !== 'object') return false
  const owner = value as Record<string, unknown>
  if (
    (owner.kind === 'account' || owner.kind === 'agent') &&
    typeof owner.id === 'string' &&
    owner.id
  )
    return { kind: owner.kind, id: owner.id }
  return false
}

function parseSharedFields(
  body: Record<string, unknown>,
  mode: 'create' | 'patch',
):
  | {
      status?: IssueStatus
      priority?: IssuePriority
      tags?: string[]
      timeSpent?: number[]
      parentId?: string | null
      branch?: string | null
    }
  | IssueBodyError {
  let status: IssueStatus | undefined
  let priority: IssuePriority | undefined
  let tags: string[] | undefined
  let timeSpent: number[] | undefined
  let parentId: string | null | undefined
  let branch: string | null | undefined

  if (body.status !== undefined) {
    if (!isStatus(body.status)) return { error: 'Invalid status' }
    status = body.status
  }
  if (body.priority !== undefined) {
    if (!isPriority(body.priority)) return { error: 'Invalid priority' }
    priority = body.priority
  }
  if (body.tags !== undefined) {
    if (!isStringArray(body.tags)) return { error: 'Invalid tags' }
    tags = body.tags
  }
  if (body.timeSpent !== undefined) {
    if (!isFiniteNumberArray(body.timeSpent))
      return { error: 'Invalid time spent' }
    timeSpent = body.timeSpent
  }
  if (body.parentId !== undefined) {
    if (mode === 'patch') {
      if (body.parentId !== null && typeof body.parentId !== 'string')
        return { error: 'Invalid parent Issue' }
      parentId = body.parentId
    } else if (typeof body.parentId !== 'string') {
      return { error: 'Invalid parent Issue' }
    } else {
      parentId = body.parentId
    }
  }
  if (mode === 'patch' && body.branch !== undefined) {
    if (body.branch !== null && typeof body.branch !== 'string')
      return { error: 'Invalid branch' }
    branch = body.branch
  }

  return {
    ...(status !== undefined ? { status } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(timeSpent !== undefined ? { timeSpent } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
    ...(branch !== undefined ? { branch } : {}),
  }
}

export function parseIssueCreate(
  body: Record<string, unknown>,
): ParsedIssueCreate | IssueBodyError {
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return { error: 'Invalid Issue title' }
  const description =
    typeof body.description === 'string' ? body.description : ''
  const shared = parseSharedFields(body, 'create')
  if ('error' in shared) return shared
  const owner =
    body.owner === undefined ? undefined : parseOwner(body.owner)
  if (owner === false) return { error: 'Invalid owner' }
  const { parentId, ...rest } = shared
  return {
    title,
    description,
    ...rest,
    ...(typeof parentId === 'string' ? { parentId } : {}),
    ...(owner ? { owner } : {}),
  }
}

export function parseIssuePatch(
  body: Record<string, unknown>,
): ParsedIssuePatch | IssueBodyError {
  const patch: ParsedIssuePatch = {}
  if (body.title !== undefined) {
    if (typeof body.title !== 'string')
      return { error: 'Invalid Issue title' }
    patch.title = body.title
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string')
      return { error: 'Invalid description' }
    patch.description = body.description
  }
  const shared = parseSharedFields(body, 'patch')
  if ('error' in shared) return shared
  return { ...patch, ...shared }
}

export function isIssueStatus(value: string): value is IssueStatus {
  return isStatus(value)
}
