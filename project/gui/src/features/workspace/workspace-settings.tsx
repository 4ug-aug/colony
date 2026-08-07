import { AgentSkillsSettings } from '#/features/workspace/agent-skills-settings'
import { ConnectionSettings } from '#/features/workspace/connection-settings'
import { CursorRuntimeSettings } from '#/features/workspace/cursor-runtime-settings'
import { InvitationSettings } from '#/features/workspace/invitation-settings'
import { LlmProviderSettings } from '#/features/workspace/llm-provider-settings'
import { MembersSettings } from '#/features/workspace/members-settings'

export function WorkspaceSettingsPage({
  currentUserId,
}: {
  currentUserId: string
}) {
  return (
    <div className="mx-auto w-full max-w-full space-y-6 p-4 sm:p-8">
      <LlmProviderSettings />
      <CursorRuntimeSettings />
      <ConnectionSettings />
      <AgentSkillsSettings />
      <InvitationSettings />
      <MembersSettings currentUserId={currentUserId} />
    </div>
  )
}
