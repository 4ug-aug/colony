import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Bot, Hash, Lock, LogOut } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { ModeToggle } from '#/components/mode-toggle'
import { Avatar } from '#/components/avatar'
import { Button } from '#/components/ui/button'
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
  SidebarMenuButton,
  SidebarMenuItem,
} from '#/components/ui/sidebar'
import type { Author, Room } from '#/features/rooms/types'
import { WorkspaceSettings } from '#/features/workspace/workspace-settings'

export function RoomSidebar({
  rooms,
  selectedRoomId,
  onSelect,
  onCreate,
  createError,
  onMentionAgent,
  user,
}: {
  rooms: Room[]
  selectedRoomId: string | undefined
  onSelect: (roomId: string) => void
  onCreate: (name: string, visibility: 'public' | 'private') => Promise<unknown>
  createError: string | undefined
  onMentionAgent: (agentId: string) => void
  user: Author
}) {
  const [creating, setCreating] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [roomVisibility, setRoomVisibility] = useState<'public' | 'private'>('public')
  const [creatingRoom, setCreatingRoom] = useState(false)
  const roomNameInput = useRef<HTMLInputElement>(null)

  const submitRoom = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!roomName.trim()) return
    setCreatingRoom(true)
    const result = await onCreate(roomName.trim(), roomVisibility)
    setCreatingRoom(false)
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

  return (
    <Sidebar variant="inset" collapsible="icon">
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
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  aria-label="Create room"
                >
                  +
                </Button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start">
                <PopoverHeader>
                  <PopoverTitle>Create room</PopoverTitle>
                </PopoverHeader>
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(event) => void submitRoom(event)}
                >
                  <input
                    ref={roomNameInput}
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    className="w-full rounded border bg-background px-2 py-1 text-sm"
                    aria-label="Room name"
                    placeholder="Room name"
                    disabled={creatingRoom}
                    required
                  />
                  <div className="flex items-center gap-1" role="group" aria-label="Visibility">
                    <button
                      type="button"
                      onClick={() => setRoomVisibility('public')}
                      disabled={creatingRoom}
                      className={`flex-1 rounded border px-2 py-1 text-xs transition-colors ${roomVisibility === 'public' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoomVisibility('private')}
                      disabled={creatingRoom}
                      className={`flex-1 rounded border px-2 py-1 text-xs transition-colors ${roomVisibility === 'private' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                    >
                      Private
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="submit"
                      size="xs"
                      disabled={creatingRoom || !roomName.trim()}
                    >
                      Create
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
                  <SidebarMenuButton
                    isActive={item.id === selectedRoomId}
                    tooltip={item.name}
                    onClick={() => onSelect(item.id)}
                    className="data-[active=true]:bg-primary/5"
                  >
                    {item.visibility === 'private' ? <Lock /> : <Hash />}
                    <span>{item.name}</span>
                  </SidebarMenuButton>
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
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 py-2">
          <Avatar author={user} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {user.name}
          </span>
          <ModeToggle />
          {user.role === 'admin' && <WorkspaceSettings />}
          <Button
            aria-label="Sign out"
            variant="outline"
            size="icon-sm"
            onClick={() => void authClient.signOut()}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
