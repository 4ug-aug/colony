import { rosterMentionHandles } from '../../../../../agents/roster-meta'
import type { RoomUser } from './room-store'

export const AGENT_MENTION_HANDLES = rosterMentionHandles()

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function mentionedAccounts(
  text: string,
  accounts: RoomUser[],
): RoomUser[] {
  return accounts.filter((account) => {
    const username = account.username ?? account.name
    if (AGENT_MENTION_HANDLES.has(username)) return false
    return new RegExp(
      `(^|[\\s([{])@${escaped(username)}(?=$|[\\s.,!?;:\\)\\]}])`,
    ).test(text)
  })
}
