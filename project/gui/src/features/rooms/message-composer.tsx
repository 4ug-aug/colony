import { forwardRef, useImperativeHandle, useRef } from 'react'
import { PromptBar } from '#/components/prompt-bar'
import type { PromptBarHandle } from '#/components/prompt-bar'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import type { MentionItem } from './mention-suggestion'
import type { MentionableAccount } from './types'

export type MessageComposerHandle = {
  mention: (agentId: string) => void
}

/* Room/thread composer: PromptBar with teammates + agents as mentions. */
export const MessageComposer = forwardRef<
  MessageComposerHandle,
  {
    value: string
    onChange: (value: string) => void
    onSubmit: (value: string, files: File[]) => Promise<boolean>
    disabled: boolean
    roomName: string
    mentionableAccounts: MentionableAccount[]
    editing?: boolean
    onCancelEdit?: () => void
  }
>(function MessageComposer({ roomName, mentionableAccounts, ...props }, ref) {
  const { data: agentDefinitions = [] } = useAgentDefinitions()
  const agents: MentionItem[] = agentDefinitions.map((agent) => ({
    id: agent.id,
    label: agent.id,
    name: agent.name,
    description: agent.description,
    kind: 'agent',
  }))
  const mentionItems: MentionItem[] = [
    ...mentionableAccounts.map((account) => {
      const username = account.username ?? account.name
      return {
        id: username,
        label: username,
        name: `@${username}`,
        description: account.displayName ?? 'Teammate',
        kind: 'account' as const,
        image: account.image,
        faceName: account.displayName ?? account.name,
      }
    }),
    ...agents,
  ]
  const bar = useRef<PromptBarHandle>(null)
  useImperativeHandle(
    ref,
    () => ({
      mention(agentId) {
        const agent = agents.find(({ id }) => id === agentId)
        if (agent) bar.current?.insertMention(agent)
      },
    }),
    [agents],
  )
  return (
    <PromptBar
      ref={bar}
      {...props}
      placeholder={`Message #${roomName} or mention someone…`}
      mentionItems={mentionItems}
      attachments
    />
  )
})
