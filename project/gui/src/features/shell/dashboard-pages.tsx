import { StaticDither } from '#/components/static-dither'
import { AccountSettingsPage } from '#/features/account/account-settings'
import type { BulletinsPageHandle } from '#/features/bulletins/bulletins-page'
import { BulletinsPage } from '#/features/bulletins/bulletins-page'
import { DocsPage } from '#/features/docs/docs-page'
import { GrillsPage } from '#/features/grills/grills-page'
import { IssuesPage } from '#/features/issues/issues-page'
import type { IssueStatus } from '#/features/issues/types'
import type { Author } from '#/features/rooms/types'
import { SchedulesPage } from '#/features/schedules/schedules-page'
import { VmsPage } from '#/features/vms/vms-page'
import { WorkspaceSettingsPage } from '#/features/workspace/workspace-settings'
import type { RefObject } from 'react'
import type { DashboardView } from './dashboard-navigation'

export function DashboardPages({
  view,
  user,
  onChangeServer,
  issueCreate,
  onIssueCreateChange,
  selectedIssueId,
  onSelectedIssueIdChange,
  bulletinsRef,
  selectedDocId,
  onSelectedDocIdChange,
  grillStartOpen,
  onGrillStartOpenChange,
  selectedGrillId,
  onSelectedGrillIdChange,
  onOpenDoc,
  selectedMachineId,
  onSelectedMachineIdChange,
  onOpenMachine,
}: {
  view: DashboardView
  user: Author
  onChangeServer: () => void
  issueCreate: { open: boolean; status?: IssueStatus }
  onIssueCreateChange: (open: boolean, status?: IssueStatus) => void
  selectedIssueId: string | undefined
  onSelectedIssueIdChange: (id: string | undefined) => void
  bulletinsRef: RefObject<BulletinsPageHandle | null>
  selectedDocId: string | undefined
  onSelectedDocIdChange: (id: string | undefined) => void
  grillStartOpen: boolean
  onGrillStartOpenChange: (open: boolean) => void
  selectedGrillId: string | undefined
  onSelectedGrillIdChange: (id: string | undefined) => void
  onOpenDoc: (docId: string) => void
  selectedMachineId: string | undefined
  onSelectedMachineIdChange: (id: string | undefined) => void
  onOpenMachine?: (sandboxId: string) => void
}) {
  return (
    <>
      {view === 'account' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AccountSettingsPage user={user} onChangeServer={onChangeServer} />
        </div>
      )}
      {view === 'workspace' && user.role === 'admin' && (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30">
          <StaticDither />
          <WorkspaceSettingsPage currentUserId={user.id} />
        </div>
      )}
      {view === 'schedules' && <SchedulesPage onOpenMachine={onOpenMachine} />}
      {view === 'issues' && (
        <IssuesPage
          createOpen={issueCreate.open}
          createStatus={issueCreate.status}
          onCreateOpenChange={onIssueCreateChange}
          selectedId={selectedIssueId}
          onSelectedIdChange={onSelectedIssueIdChange}
          onOpenMachine={onOpenMachine}
        />
      )}
      {view === 'bulletins' && (
        <BulletinsPage ref={bulletinsRef} currentUserId={user.id} />
      )}
      {view === 'docs' && (
        <div className="min-h-0 flex-1 overflow-hidden animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out fill-mode-backwards motion-reduce:animate-none">
          <DocsPage
            selectedId={selectedDocId}
            onSelectedIdChange={onSelectedDocIdChange}
          />
        </div>
      )}
      {view === 'grills' && (
        <div className="min-h-0 flex-1 overflow-hidden animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out fill-mode-backwards motion-reduce:animate-none">
          <GrillsPage
            startOpen={grillStartOpen}
            onStartOpenChange={onGrillStartOpenChange}
            selectedId={selectedGrillId}
            onSelectedIdChange={onSelectedGrillIdChange}
            onOpenDoc={onOpenDoc}
          />
        </div>
      )}
      {view === 'vms' && user.role === 'admin' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <VmsPage
            selectedId={selectedMachineId}
            onSelectedIdChange={onSelectedMachineIdChange}
          />
        </div>
      )}
    </>
  )
}
