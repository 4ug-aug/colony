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
import { Button } from '#/components/ui/button'
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
import { toast } from '#/components/ui/toast'
import { AgentMark } from '#/features/agents/agent-mark'
import { cn } from '#/lib/utils'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useChats, useDeleteChat } from './use-chats'

export function ChatHistorySheet({
  selectedChatId,
  onSelectChat,
}: {
  selectedChatId: string | undefined
  onSelectChat: (id: string | undefined) => void
}) {
  const { data: chats = [] } = useChats()
  const deleteChat = useDeleteChat()
  const [chatToDelete, setChatToDelete] = useState<(typeof chats)[number]>()

  return (
    <>
      <HoverCard>
        <HoverCardTrigger
          delay={150}
          closeDelay={200}
          render={
            <button
              type="button"
              className="absolute inset-y-0 right-0 z-20 flex w-6 items-center justify-center rounded-none text-muted-foreground outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="Previous chats"
            />
          }
        >
          <ChevronRight className="size-4" />
        </HoverCardTrigger>
        <HoverCardContent
          side="left"
          align="center"
          sideOffset={4}
          className="w-64 p-1.5"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => onSelectChat(undefined)}
          >
            <Plus data-icon="inline-start" />
            New chat
          </Button>
          {chats.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No previous chats
            </p>
          ) : (
            <ul className="max-h-[min(28rem,70vh)] overflow-y-auto">
              {chats.map((chat) => {
                return (
                  <li key={chat.id}>
                    <ContextMenu>
                      <ContextMenuTrigger
                        render={
                          <button
                            type="button"
                            onClick={() => onSelectChat(chat.id)}
                            className={cn(
                              'flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40',
                              chat.id === selectedChatId &&
                                'bg-muted/60 font-medium',
                            )}
                          />
                        }
                      >
                        <AgentMark agentId={chat.agentDefinitionId} />
                        <span className="min-w-0 truncate">{chat.title}</span>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuGroup>
                          <ContextMenuItem
                            variant="destructive"
                            onClick={() => setChatToDelete(chat)}
                          >
                            <Trash2 />
                            Delete chat
                          </ContextMenuItem>
                        </ContextMenuGroup>
                      </ContextMenuContent>
                    </ContextMenu>
                  </li>
                )
              })}
            </ul>
          )}
        </HoverCardContent>
      </HoverCard>
      <AlertDialog
        open={chatToDelete !== undefined}
        onOpenChange={(open) => {
          if (!open) setChatToDelete(undefined)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {chatToDelete?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the chat and its transcript.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const chat = chatToDelete
                if (!chat) return
                void deleteChat.mutateAsync(chat.id).then(() => {
                  setChatToDelete(undefined)
                  if (selectedChatId === chat.id) onSelectChat(undefined)
                  toast.add({
                    type: 'success',
                    title: 'Chat deleted',
                    description: `${chat.title} was permanently deleted.`,
                  })
                })
              }}
            >
              Delete chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
