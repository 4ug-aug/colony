import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import {
  Bot,
  CalendarClock,
  Hash,
  Lock,
  LogOut,
  Settings,
  Trash2,
} from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Input } from '#/components/ui/input'
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
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from '#/components/ui/context-menu'
import { toast } from '#/components/ui/toast'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '#/components/ui/popover'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '#/components/ui/hover-card'
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
} from '#/components/ui/sidebar'
import type { Author, Room } from '#/features/rooms/types'
import type { RoomNotification } from '#/features/rooms/room-notifications'
import { canDeleteRoom } from '#/features/rooms/permissions'
import { isTauriRuntime } from '#/lib/server-config'
import { cn } from '#/lib/utils'

const softwareEngineerCapabilities = [
  {
    name: 'Linear issues',
    icon: '/icons/linear.svg',
    invertOnDark: false,
    tools: ['Get issues', 'List issues', 'Save comments', 'Save issues'],
  },
  {
    name: 'GitHub pull requests',
    icon: '/icons/github.svg',
    invertOnDark: true,
    tools: ['Create pull requests', 'Wait for pull request checks'],
  },
  {
    name: 'Asana tasks',
    icon: '/icons/asana.svg',
    invertOnDark: false,
    tools: [
      'Get project',
      'Create tasks',
      'List tasks',
      'Get task details',
      'Read comments',
      'Update completion',
      'Add comments',
    ],
  },
  {
    name: 'Room context',
    icon: undefined,
    invertOnDark: false,
    tools: ['Read messages', 'Post messages'],
  },
] as const

export type DashboardView = 'room' | 'account' | 'workspace' | 'schedules'

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
  user: Author
}) {
  const [creating, setCreating] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [roomVisibility, setRoomVisibility] = useState<'public' | 'private'>(
    'public',
  )
  const [pending, setPending] = useState(false)
  const [roomToDelete, setRoomToDelete] = useState<Room>()
  const roomNameInput = useRef<HTMLInputElement>(null)

  const submitRoom = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!roomName.trim()) return
    setPending(true)
    const result = await onCreate(roomName.trim(), roomVisibility)
    setPending(false)
    if (result) {
      setRoomName('')
      setRoomVisibility('public')
      setCreating(false)
    }
  }

  const cancelRoom = () => {
    setRoomName('')
    setRoomVisibility('public')
    setCreating(false)
  }

  useEffect(() => {
    if (creating) roomNameInput.current?.focus()
  }, [creating])

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
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <HoverCard>
                  <HoverCardTrigger
                    delay={150}
                    closeDelay={100}
                    render={
                      <SidebarMenuButton
                        aria-label="Software engineer. View capabilities."
                        onClick={() => onMentionAgent('software-engineer')}
                      />
                    }
                  >
                    <Bot />
                    <span>Software engineer</span>
                  </HoverCardTrigger>
                  <HoverCardContent side="right" align="start" className="w-80">
                    <div className="flex flex-col gap-1">
                      <h2 className="text-sm font-semibold">
                        Software engineer
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Build, debug, and review code.
                      </p>
                    </div>
                    <div className="mt-3 flex flex-col gap-3">
                      {softwareEngineerCapabilities.map((capability) => (
                        <div
                          key={capability.name}
                          className="flex flex-col gap-1"
                        >
                          <div className="flex items-center gap-2">
                            {capability.icon && (
                              <img
                                src={capability.icon}
                                alt=""
                                className={cn(
                                  'size-4 shrink-0',
                                  capability.invertOnDark && 'dark:invert',
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
                      ))}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <div className="flex items-center justify-between pr-2">
            <SidebarGroupLabel>Rooms</SidebarGroupLabel>
            <Popover
              open={creating}
              onOpenChange={(open) => {
                if (open) setCreating(true)
                else cancelRoom()
              }}
            >
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    aria-label="Create room"
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
                      onClick={() => setRoomVisibility('public')}
                      disabled={pending}
                      size="xs"
                      variant={
                        roomVisibility === 'public' ? 'default' : 'outline'
                      }
                      className="flex-1"
                    >
                      Public
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setRoomVisibility('private')}
                      disabled={pending}
                      size="xs"
                      variant={
                        roomVisibility === 'private' ? 'default' : 'outline'
                      }
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
                      {pending ? (
                        <BrailleLoader text="Creating room" />
                      ) : (
                        'Create'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={cancelRoom}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
                {creating && createError && (
                  <p className="mt-1 text-xs text-destructive" role="alert">
                    {createError}
                  </p>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <SidebarGroupContent>
            <SidebarMenu>
              {rooms.map((item) => {
                const notification = notificationByRoom[item.id]
                const notificationLabel =
                  notification === 'mention'
                    ? 'has a mention'
                    : notification === 'unread'
                      ? 'has new messages'
                      : undefined
                return (
                  <SidebarMenuItem key={item.id}>
                    <ContextMenu disabled={!canDeleteRoom(user, item)}>
                      <ContextMenuTrigger
                        render={
                          <SidebarMenuButton
                            isActive={
                              view === 'room' && item.id === selectedRoomId
                            }
                            tooltip={
                              notificationLabel
                                ? `${item.name} · ${notificationLabel}`
                                : item.name
                            }
                            aria-label={
                              notificationLabel
                                ? `${item.name}, ${notificationLabel}`
                                : item.name
                            }
                            onClick={() => onSelect(item.id)}
                            className="data-[active=true]:bg-primary/5"
                          />
                        }
                      >
                        {item.visibility === 'private' ? <Lock /> : <Hash />}
                        <span>{item.name}</span>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuGroup>
                          <ContextMenuItem
                            variant="destructive"
                            onClick={() => setRoomToDelete(item)}
                          >
                            <Trash2 />
                            Delete room
                          </ContextMenuItem>
                        </ContextMenuGroup>
                      </ContextMenuContent>
                    </ContextMenu>
                    {notification && (
                      <>
                        <SidebarMenuBadge
                          aria-hidden="true"
                          className="h-auto min-w-0 p-0"
                        >
                          <span
                            className={cn(
                              'size-2 rounded-full',
                              notification === 'mention'
                                ? 'bg-orange-500'
                                : 'bg-green-500',
                            )}
                          />
                        </SidebarMenuBadge>
                        <span
                          aria-hidden="true"
                          className={cn(
                            'absolute top-0 right-0 z-10 hidden size-2.5 rounded-full ring-2 ring-sidebar',
                            'group-data-[collapsible=icon]:block',
                            notification === 'mention'
                              ? 'bg-orange-500'
                              : 'bg-green-500',
                          )}
                        />
                      </>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
