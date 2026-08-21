import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { AgentSkillsSettings } from '#/features/workspace/agent-skills-settings'
import { ConnectionSettings } from '#/features/workspace/connection-settings'
import { CursorRuntimeSettings } from '#/features/workspace/cursor-runtime-settings'
import { GrantToolsSettings } from '#/features/workspace/grant-tools-settings'
import { InvitationSettings } from '#/features/workspace/invitation-settings'
import { LlmProviderSettings } from '#/features/workspace/llm-provider-settings'
import { MembersSettings } from '#/features/workspace/members-settings'
import { PreviewSettings } from '#/features/workspace/preview-settings'

const tabEnter =
  'min-h-0 overflow-y-auto space-y-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out fill-mode-backwards motion-reduce:animate-none'

export function WorkspaceSettingsPage({
  currentUserId,
}: {
  currentUserId: string
}) {
  return (
    <main className="relative mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col p-4 sm:p-6 lg:p-8">
      <Tabs defaultValue="runtime" className="min-h-0 flex-1 gap-4">
        <TabsList className="w-full shrink-0 bg-card/90 shadow-sm backdrop-blur-sm animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out fill-mode-backwards motion-reduce:animate-none sm:w-fit">
          <TabsTrigger value="runtime">Runtime</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
        </TabsList>

        <TabsContent value="runtime" className={tabEnter}>
          <div className="grid gap-3 md:grid-cols-2">
            <LlmProviderSettings />
            <CursorRuntimeSettings />
            <div className="md:col-span-2">
              <PreviewSettings />
            </div>
            <div className="md:col-span-2">
              <GrantToolsSettings />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="integrations" className={tabEnter}>
          <ConnectionSettings />
          <AgentSkillsSettings />
        </TabsContent>

        <TabsContent value="people" className={tabEnter}>
          <div className="grid gap-3 md:grid-cols-2">
            <InvitationSettings />
            <MembersSettings currentUserId={currentUserId} />
          </div>
        </TabsContent>
      </Tabs>
    </main>
  )
}
