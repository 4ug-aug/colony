import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  useSidebar,
} from '#/components/ui/sidebar'
import { useStoredBoolean } from '#/hooks/use-stored-boolean'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

const panelClassName =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out motion-reduce:transition-none data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 [&[hidden]:not([hidden='until-found'])]:hidden"

/**
 * A sidebar section that remembers whether it is expanded. Sections stay
 * expanded while the sidebar itself is collapsed to icons, since their labels
 * and triggers are hidden in that state.
 */
export function CollapsibleGroup({
  storageKey,
  label,
  action,
  children,
}: {
  storageKey: string
  label: string
  action?: ReactNode
  children: ReactNode
}) {
  const { state } = useSidebar()
  const [expanded, setExpanded] = useStoredBoolean(
    `sidebar.group.${storageKey}`,
    true,
  )

  return (
    <Collapsible
      open={state === 'collapsed' || expanded}
      onOpenChange={setExpanded}
    >
      <SidebarGroup>
        <div className="flex items-center justify-between pr-2 group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel
            className="group/label flex-1 gap-1 hover:text-sidebar-foreground"
            render={<CollapsibleTrigger />}
          >
            <ChevronRight className="transition-transform duration-200 group-data-[panel-open]/label:rotate-90 motion-reduce:transition-none" />
            {label}
          </SidebarGroupLabel>
          {action}
        </div>
        <CollapsibleContent className={panelClassName}>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
