import type { IssueOwner } from './types'

export function ownerValue(owner: IssueOwner | undefined): string {
  if (!owner) return 'none'
  return `${owner.kind}:${owner.id}`
}

export function parseOwnerValue(value: string | null): IssueOwner | null {
  if (!value || value === 'none') return null
  const separator = value.indexOf(':')
  if (separator <= 0) return null
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (!id) return null
  if (kind === 'account' || kind === 'agent') return { kind, id }
  return null
}
