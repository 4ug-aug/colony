import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { toast } from '#/components/ui/toast'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { useMediaQuery } from '#/hooks/use-media-query'
import { Copy, Ellipsis, MessageCircle, SquarePen } from 'lucide-react'
import { useState, type ReactNode } from 'react'

export function roomMessageActionsVisible({
  coarsePointer,
  menuOpen,
}: {
  coarsePointer: boolean
  menuOpen: boolean
}) {
  return coarsePointer || menuOpen
}

async function copyMessage(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Copied as markdown', type: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', type: 'error' })
  }
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="room-message-action"
            aria-label={label}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export function MessageActionToolbar({
  text,
  onReply,
  onEdit,
  onOpenChange,
}: {
  text: string
  onReply?: () => void
  onEdit?: () => void
  onOpenChange?: (open: boolean) => void
}) {
  const coarsePointer = useMediaQuery('(pointer: coarse)')
  const [menuOpen, setMenuOpen] = useState(false)
  const visible = roomMessageActionsVisible({ coarsePointer, menuOpen })

  const reply = () => onReply?.()
  const edit = () => onEdit?.()
  const copy = () => void copyMessage(text)

  const setOpen = (open: boolean) => {
    setMenuOpen(open)
    onOpenChange?.(open)
  }

  if (coarsePointer) {
    return (
      <div className="room-message-actions" data-visible="">
        <DropdownMenu onOpenChange={setOpen}>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="room-message-action"
                aria-label="Message actions"
                onPointerDown={(event) => event.stopPropagation()}
              />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuGroup>
              {onReply && (
                <DropdownMenuItem
                  onClick={reply}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <MessageCircle />
                  Reply in thread
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem
                  onClick={edit}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <SquarePen />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={copy}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Copy />
                Copy as markdown
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <div
      className="room-message-actions"
      data-visible={visible ? '' : undefined}
    >
      {onReply && (
        <ActionButton label="Reply in thread" onClick={reply}>
          <MessageCircle />
        </ActionButton>
      )}
      {onEdit && (
        <ActionButton label="Edit" onClick={edit}>
          <SquarePen />
        </ActionButton>
      )}
      <ActionButton label="Copy as markdown" onClick={copy}>
        <Copy />
      </ActionButton>
    </div>
  )
}
