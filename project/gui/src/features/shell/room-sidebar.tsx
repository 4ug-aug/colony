import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Bot, Hash, Lock, LogOut, Settings, Trash2 } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { canDeleteRoom } from '#/features/rooms/permissions'
import { isTauriRuntime } from '#/lib/server-config'

export type DashboardView = 'room' | 'account' | 'workspace'

export function RoomSidebar({
  rooms,
  selectedRoomId,
  onSelect,
  onCreate,
  onDelete,
  createError,
  onMentionAgent,
  view,
  onOpenAccount,
  onOpenWorkspace,
  user,
}: {
  rooms: Room[]
  selectedRoomId: string | undefined
  onSelect: (roomId: string) => void
  onCreate: (name: string, visibility: 'public' | 'private') => Promise<unknown>
  onDelete: (roomId: string) => Promise<unknown>
  createError: string | undefined
  onMentionAgent: (agentId: string) => void
  view: DashboardView
  onOpenAccount: () => void
  onOpenWorkspace: () => void
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
                      {pending ? 'Creating…' : 'Create'}
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
              {rooms.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <ContextMenu disabled={!canDeleteRoom(user, item)}>
                    <ContextMenuTrigger
                      render={
                        <SidebarMenuButton
                          isActive={
                            view === 'room' && item.id === selectedRoomId
                          }
                          tooltip={
                            item.attentionCount
                              ? `${item.name} · ${item.attentionCount} need attention`
                              : item.name
                          }
                          aria-label={
                            item.attentionCount
                              ? `${item.name}, ${item.attentionCount} need attention`
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
                  {item.attentionCount > 0 && (
                    <>
                      <SidebarMenuBadge aria-hidden="true">
                        {item.attentionCount > 99 ? '99+' : item.attentionCount}
                      </SidebarMenuBadge>
                      <span
                        aria-hidden="true"
                        className="absolute top-1 right-1 hidden size-2 rounded-full bg-primary group-data-[collapsible=icon]:block"
                      />
                    </>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Software engineer"
                  onClick={() => onMentionAgent('software-engineer')}
                >
                  <Bot />
                  <span>Software engineer</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {user.role === 'admin' && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
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
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex min-w-0 items-center gap-2">
          <SidebarMenu className="min-w-0 flex-1">
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
            variant="outline"
            size="icon-sm"
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
