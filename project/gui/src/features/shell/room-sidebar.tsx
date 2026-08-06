import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from '#/components/ui/context-menu'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '#/components/ui/hover-card'
import { Input } from '#/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '#/components/ui/popover'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '#/components/ui/sidebar'
import { toast } from '#/components/ui/toast'
import { agentIcon } from '#/features/agents/agent-icon'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import { canDeleteRoom } from '#/features/rooms/permissions'
import type { RoomNotification } from '#/features/rooms/room-notifications'
import type { Author, Room } from '#/features/rooms/types'
import { useStoredBoolean } from '#/hooks/use-stored-boolean'
import { authClient } from '#/lib/auth-client'
import { isTauriRuntime } from '#/lib/server-config'
import { cn } from '#/lib/utils'
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from '#/components/ui/avatar'
import {
  CalendarClock,
  ChevronRight,
  Cuboid,
  Hash,
  Lock,
  LogOut,
  ScrollText,
  Settings,
  Trash2,
} from 'lucide-react'
import type { ReactNode, SubmitEvent } from 'react'
import { useEffect, useRef, useState } from 'react'

const capabilityIcons: Record<
  string,
  { icon?: string; invertOnDark?: boolean }
> = {
  'linear.issues': { icon: '/icons/linear.svg' },
  'workspace.issues': { icon: '/app-icon.png' },
  'github.pull-requests': { icon: '/icons/github.svg', invertOnDark: true },
  'asana.tasks': { icon: '/icons/asana.svg' },
  'outline.documents': { icon: '/icons/outline.svg', invertOnDark: true },
  'workspace.room': {},
}

const panelClassName =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out motion-reduce:transition-none data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 [&[hidden]:not([hidden='until-found'])]:hidden"

export type DashboardView =
  | 'room'
  | 'account'
  | 'workspace'
  | 'schedules'
  | 'issues'

/**
 * A sidebar section that remembers whether it is expanded. Sections stay
 * expanded while the sidebar itself is collapsed to icons, since their labels
 * and triggers are hidden in that state.
 */
function CollapsibleGroup({
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

function CreateRoomPopover({
  group,
  onCreate,
  createError,
}: {
  group: 'public' | 'private'
  onCreate: (name: string, visibility: 'public' | 'private') => Promise<unknown>
  createError: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [visibility, setVisibility] = useState(group)
  const [pending, setPending] = useState(false)
  const roomNameInput = useRef<HTMLInputElement>(null)

  const close = () => {
    setRoomName('')
    setVisibility(group)
    setOpen(false)
  }

  const submitRoom = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!roomName.trim()) return
    setPending(true)
    const result = await onCreate(roomName.trim(), visibility)
    setPending(false)
    if (result) close()
  }

  useEffect(() => {
    if (open) roomNameInput.current?.focus()
  }, [open])

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true)
        else close()
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-label={`Create ${group} room`}
          />
        }
      >
        +
      </PopoverTrigger>
      <PopoverContent side="right" align="start">
        <PopoverHeader>
          <PopoverTitle>Create room</PopoverTitle>
        </PopoverHeader>
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => void submitRoom(event)}
        >
          <Input
            ref={roomNameInput}
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            className="h-8"
            aria-label="Room name"
            placeholder="Room name"
            disabled={pending}
            required
            pattern={'.*\\S.*'}
            title="Room name cannot be blank"
          />
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Visibility"
          >
            <Button
              type="button"
              onClick={() => setVisibility('public')}
              disabled={pending}
              size="xs"
              variant={visibility === 'public' ? 'default' : 'outline'}
              className="flex-1"
            >
              Public
            </Button>
            <Button
              type="button"
              onClick={() => setVisibility('private')}
              disabled={pending}
              size="xs"
              variant={visibility === 'private' ? 'default' : 'outline'}
              className="flex-1"
            >
              Private
            </Button>
          </div>
          <div className="flex gap-1">
            <Button
              type="submit"
              size="xs"
              disabled={pending || !roomName.trim()}
            >
              {pending ? <BrailleLoader text="Creating room" /> : 'Create'}
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
        {createError && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {createError}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

function RoomMenuItem({
  room,
  isActive,
  notification,
  canDelete,
  onSelect,
  onRequestDelete,
}: {
  room: Room
  isActive: boolean
  notification: RoomNotification | undefined
  canDelete: boolean
  onSelect: () => void
  onRequestDelete: () => void
}) {
  const notificationLabel =
    notification === 'mention'
      ? 'has a mention'
      : notification === 'unread'
        ? 'has new messages'
        : undefined

  return (
    <SidebarMenuItem>
      <ContextMenu disabled={!canDelete}>
        <ContextMenuTrigger
          render={
            <SidebarMenuButton
              isActive={isActive}
              tooltip={
                notificationLabel
                  ? `${room.name} · ${notificationLabel}`
                  : room.name
              }
              aria-label={
                notificationLabel
                  ? `${room.name}, ${notificationLabel}`
                  : room.name
              }
              onClick={onSelect}
              className="data-[active=true]:bg-primary/5"
            />
          }
        >
          {room.visibility === 'private' ? <Lock /> : <Hash />}
          <span>{room.name}</span>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuGroup>
            <ContextMenuItem variant="destructive" onClick={onRequestDelete}>
              <Trash2 />
              Delete room
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      {notification && (
        <>
          <SidebarMenuBadge aria-hidden="true" className="h-auto min-w-0 p-0">
            <span
              className={cn(
                'size-2 rounded-full',
                notification === 'mention' ? 'bg-orange-500' : 'bg-green-500',
              )}
            />
          </SidebarMenuBadge>
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-0 right-0 z-10 hidden size-2.5 rounded-full ring-2 ring-sidebar',
              'group-data-[collapsible=icon]:block',
              notification === 'mention' ? 'bg-orange-500' : 'bg-green-500',
            )}
          />
        </>
      )}
    </SidebarMenuItem>
  )
}

export function RoomSidebar({
  rooms,
  selectedRoomId,
  onSelect,
  onCreate,
  onDelete,
  createError,
  notificationByRoom,
  onMentionAgent,
  view,
  onOpenAccount,
  onOpenWorkspace,
  onOpenSchedules,
  onOpenIssues,
  user,
}: {
  rooms: Room[]
  selectedRoomId: string | undefined
  onSelect: (roomId: string) => void
  onCreate: (name: string, visibility: 'public' | 'private') => Promise<unknown>
  onDelete: (roomId: string) => Promise<unknown>
  createError: string | undefined
  notificationByRoom: Partial<Record<string, RoomNotification>>
  onMentionAgent: (agentId: string) => void
  view: DashboardView
  onOpenAccount: () => void
  onOpenWorkspace: () => void
  onOpenSchedules: () => void
  onOpenIssues: () => void
  user: Author
}) {
  const { data: agents = [] } = useAgentDefinitions()
  const [roomToDelete, setRoomToDelete] = useState<Room>()

  const roomsByVisibility = (visibility: 'public' | 'private') =>
    rooms.filter((room) => room.visibility === visibility)

  const roomGroup = (visibility: 'public' | 'private') => (
    <CollapsibleGroup
      storageKey={`${visibility}-rooms`}
      label={visibility === 'private' ? 'Private rooms' : 'Public rooms'}
      action={
        <CreateRoomPopover
          group={visibility}
          onCreate={onCreate}
          createError={createError}
        />
      }
    >
      <SidebarMenu>
        {roomsByVisibility(visibility).map((room) => (
          <RoomMenuItem
            key={room.id}
            room={room}
            isActive={view === 'room' && room.id === selectedRoomId}
            notification={notificationByRoom[room.id]}
            canDelete={canDeleteRoom(user, room)}
            onSelect={() => onSelect(room.id)}
            onRequestDelete={() => setRoomToDelete(room)}
          />
        ))}
      </SidebarMenu>
    </CollapsibleGroup>
  )

  return [
    !isTauriRuntime() && (
      <SidebarTrigger
        key="mobile-trigger"
        className="fixed top-3 left-3 z-30 md:hidden"
        title="Open navigation"
      />
    ),
    <Sidebar key="sidebar" variant="inset" collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === 'issues'}
                  onClick={onOpenIssues}
                  tooltip="Issues"
                >
                  <Cuboid />
                  <span>Issues</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <CollapsibleGroup storageKey="agents" label="Agents">
          <SidebarMenu>
            {agents.map((agent) => {
              const Icon = agentIcon(agent.icon)
              return (
                <SidebarMenuItem key={agent.id}>
                  <HoverCard>
                    <HoverCardTrigger
                      delay={150}
                      closeDelay={200}
                      render={
                        <SidebarMenuButton
                          aria-label={`${agent.name}. View capabilities.`}
                          onClick={() => onMentionAgent(agent.id)}
                        />
                      }
                    >
                      <Icon />
                      <span>{agent.name}</span>
                    </HoverCardTrigger>
                    <HoverCardContent
                      side="right"
                      align="start"
                      className="w-80"
                    >
                      <div className="flex flex-col gap-1">
                        <h2 className="text-sm font-semibold">{agent.name}</h2>
                        <p className="text-xs text-muted-foreground">
                          {agent.description}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-col gap-3">
                        {agent.capabilities.map((capability) => {
                          const presentation =
                            capabilityIcons[capability.id] ?? {}
                          return (
                            <div
                              key={capability.id}
                              className="flex flex-col gap-1"
                            >
                              <div className="flex items-center gap-2">
                                {presentation.icon && (
                                  <img
                                    src={presentation.icon}
                                    alt=""
                                    className={cn(
                                      'size-4 shrink-0',
                                      presentation.invertOnDark &&
                                        'dark:invert',
                                    )}
                                  />
                                )}
                                <p className="text-xs font-medium">
                                  {capability.name}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {capability.tools.join(' · ')}
                              </p>
                            </div>
                          )
                        })}
                        {(agent.skills ?? []).length > 0 && (
                          <div className="flex flex-col gap-1.5 border-t pt-3">
                            <p className="text-xs font-medium text-muted-foreground">
                              Skills
                            </p>
                            <ul className="flex flex-col gap-1">
                              {(agent.skills ?? []).map((skill) => (
                                <li key={skill.id}>
                                  <HoverCard>
                                    <HoverCardTrigger
                                      delay={100}
                                      closeDelay={100}
                                      render={
                                        <button
                                          type="button"
                                          className="group/skill flex w-full items-start gap-2 rounded-md border border-transparent bg-muted/40 px-2 py-1.5 text-left outline-none transition-colors hover:border-border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                                        />
                                      }
                                    >
                                      <ScrollText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-medium">
                                          {skill.name.replace(/-/g, ' ')}
                                        </span>
                                        <span className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground">
                                          {skill.description}
                                        </span>
                                      </span>
                                      <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/skill:opacity-100 group-data-[popup-open]/skill:opacity-100" />
                                    </HoverCardTrigger>
                                    <HoverCardContent
                                      side="right"
                                      align="start"
                                      sideOffset={8}
                                      className="w-72"
                                    >
                                      <div className="flex items-start gap-2">
                                        <ScrollText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0">
                                          <p className="text-sm font-semibold">
                                            {skill.name.replace(/-/g, ' ')}
                                          </p>
                                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                            {skill.description}
                                          </p>
                                        </div>
                                      </div>
                                    </HoverCardContent>
                                  </HoverCard>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </CollapsibleGroup>
        {roomGroup('public')}
        {roomGroup('private')}
      </SidebarContent>
      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === 'schedules'}
                  onClick={onOpenSchedules}
                >
                  <CalendarClock />
                  <span>Schedules</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {user.role === 'admin' && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Workspace settings"
                    isActive={view === 'workspace'}
                    onClick={onOpenWorkspace}
                  >
                    <Settings />
                    <span>Workspace</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <div className="flex min-w-0 items-center justify-center gap-2 group-data-[collapsible=icon]:justify-center">
          <SidebarMenu className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none">
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="User settings"
                isActive={view === 'account'}
                onClick={onOpenAccount}
              >
                <Avatar>
                  <AvatarImage
                    src="/app-icon.png"
                    alt=""
                    className="bg-white p-1"
                  />
                  <AvatarFallback>{user.name.slice(0, 1)}</AvatarFallback>
                  <AvatarBadge className="bg-green-600 dark:bg-green-800" />
                </Avatar>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {user.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    User settings
                  </span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <Button
            aria-label="Sign out"
            variant="ghost"
            size="icon-sm"
            className="group-data-[collapsible=icon]:hidden"
            onClick={() => void authClient.signOut()}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </SidebarFooter>
      <AlertDialog
        open={roomToDelete !== undefined}
        onOpenChange={(open) => {
          if (!open) setRoomToDelete(undefined)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {roomToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the room and all of its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const room = roomToDelete
                if (!room) return
                void onDelete(room.id).then((result) => {
                  if (!result) return
                  setRoomToDelete(undefined)
                  toast.add({
                    type: 'success',
                    title: 'Room deleted',
                    description: `${room.name} and its messages were permanently deleted.`,
                  })
                })
              }}
            >
              Delete room
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>,
  ]
}
