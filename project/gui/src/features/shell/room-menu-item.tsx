import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from '#/components/ui/context-menu'
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '#/components/ui/sidebar'
import type { RoomNotification } from '#/features/rooms/room-notifications'
import type { Room } from '#/features/rooms/types'
import { cn } from '#/lib/utils'
import { Hash, Lock, Trash2 } from 'lucide-react'

export function RoomMenuItem({
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
