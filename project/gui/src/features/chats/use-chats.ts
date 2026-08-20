import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson, apiJsonBody } from '#/lib/api-transport'
import type { Chat, ChatDetail } from './types'

const LAST_AGENT_KEY = 'sweat.chat.lastAgentDefinitionId'
const chatsQueryKey = ['chats'] as const
const chatQueryKey = (id: string) => ['chats', id] as const

export function useLastChatAgent(fallback: string) {
  const [value, setValue] = useState(
    () => localStorage.getItem(LAST_AGENT_KEY) ?? fallback,
  )
  const store = useCallback((next: string) => {
    setValue(next)
    localStorage.setItem(LAST_AGENT_KEY, next)
  }, [])
  return [value, store] as const
}

export function useChats() {
  return useQuery({
    queryKey: chatsQueryKey,
    queryFn: async (): Promise<Chat[]> => {
      const data = await apiJson<{ chats?: Chat[] }>(
        '/api/chats',
        undefined,
        'Unable to load chats',
      )
      return data.chats ?? []
    },
  })
}

export function useChat(chatId: string | undefined) {
  return useQuery({
    queryKey: chatId ? chatQueryKey(chatId) : ['chats', 'none'],
    queryFn: () =>
      apiJson<ChatDetail>(
        `/api/chats/${encodeURIComponent(chatId!)}`,
        undefined,
        'Unable to load chat',
      ),
    enabled: Boolean(chatId),
    refetchInterval: (query) =>
      query.state.data?.linkedRun?.turnActive ? 750 : false,
  })
}

export function useCreateChat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (agentDefinitionId: string): Promise<Chat> => {
      const data = await apiJsonBody<{ chat?: Chat }>(
        '/api/chats',
        'POST',
        { agentDefinitionId },
        'Unable to create chat',
      )
      if (!data.chat) throw new Error('Unable to create chat')
      return data.chat
    },
    onSuccess: (chat) => {
      queryClient.setQueryData(chatQueryKey(chat.id), {
        chat,
        messages: [],
        liveSteps: [],
        linkedRun: null,
      } satisfies ChatDetail)
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey })
    },
  })
}

export function useSendChatMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { chatId: string; text: string }) => {
      const data = await apiJsonBody<ChatDetail & { message?: unknown }>(
        `/api/chats/${encodeURIComponent(input.chatId)}/messages`,
        'POST',
        { text: input.text },
        'Unable to send message',
      )
      return data
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: chatQueryKey(input.chatId) })
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey })
    },
  })
}

export function useCancelChatTurn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (chatId: string) => {
      await apiJsonBody(
        `/api/chats/${encodeURIComponent(chatId)}/cancel`,
        'POST',
        {},
        'Unable to stop chat',
      )
    },
    onSuccess: (_void, chatId) => {
      void queryClient.invalidateQueries({ queryKey: chatQueryKey(chatId) })
    },
  })
}

export function useDeleteChat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (chatId: string) => {
      await apiJsonBody(
        `/api/chats/${encodeURIComponent(chatId)}`,
        'DELETE',
        {},
        'Unable to delete chat',
      )
    },
    onSuccess: (_void, chatId) => {
      queryClient.removeQueries({ queryKey: chatQueryKey(chatId) })
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey })
    },
  })
}
