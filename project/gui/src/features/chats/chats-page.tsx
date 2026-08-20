import { AgentAnt } from '#/components/avatar'
import { Markdown } from '#/components/markdown'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { toast } from '#/components/ui/toast'
import { agentIcon } from '#/features/agents/agent-icon'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { MessageComposer } from '#/features/rooms/message-composer'
import { groupActivity, pairSteps } from '#/features/runs/run-activity'
import { stepLabel, type Step } from '#/features/runs/step-label'
import { ToolCallDetailsList } from '#/features/runs/tool-call-details-list'
import { Ban, MessageCircle, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ChatMessageStep } from './types'
import {
  useCancelChatTurn,
  useChat,
  useCreateChat,
  useLastChatAgent,
  useSendChatMessage,
} from './use-chats'

const DEFAULT_AGENT_ID = 'software-engineer'

function asStep(step: ChatMessageStep, runId: string): Step {
  return {
    id: step.id,
    runId,
    idx: step.idx,
    kind: step.kind,
    ...(step.tool ? { tool: step.tool } : {}),
    ...(step.callId ? { callId: step.callId } : {}),
    text: step.text,
    createdAt: step.createdAt,
  }
}

function AssistantTurn({
  text,
  steps,
  runId,
  working,
  error,
}: {
  text: string
  steps: ChatMessageStep[]
  runId: string
  working?: boolean
  error?: string
}) {
  const items = pairSteps(steps.map((step) => asStep(step, runId)))
  const groups = groupActivity(items)
  const latest = items.at(-1)?.step
  return (
    <div className="flex gap-3">
      <div
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <AgentAnt className="size-6" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {groups
          .filter((group) => working || group.kind === 'tools')
          .map((group, index) =>
          group.kind === 'reasoning' ? (
            <p
              key={group.item.step.id}
              className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground animate-in fade-in-0 slide-in-from-bottom-1 duration-300 fill-mode-both motion-reduce:animate-none"
            >
              {group.item.step.text}
            </p>
          ) : (
            <ToolCallDetailsList key={`tools-${index}`} items={group.items} />
          ),
        )}
        {text ? (
          <div className="agent-message-frame">
            <div className="agent-message-inner">
              <Markdown>{text}</Markdown>
            </div>
          </div>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {working ? (
          <p className="text-sm text-muted-foreground" role="status">
            <BrailleLoader text={latest ? stepLabel(latest) : 'Working'} />
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function ChatsPage({
  selectedId,
  onSelectedIdChange,
}: {
  selectedId?: string
  onSelectedIdChange: (id: string | undefined) => void
}) {
  const { data: agents = [] } = useAgentDefinitions()
  const [agentId, setAgentId] = useLastChatAgent(DEFAULT_AGENT_ID)
  const selectedAgent =
    agents.find((agent) => agent.id === agentId) ?? agents[0]
  const { data, error, isPending } = useChat(selectedId)
  const create = useCreateChat()
  const send = useSendChatMessage()
  const cancel = useCancelChatTurn()
  const [draft, setDraft] = useState('')
  const follow = useRef(true)
  const chat = data?.chat
  const messages = data?.messages ?? []
  const liveSteps = data?.liveSteps ?? []
  const linkedRun = data?.linkedRun
  const turnActive = Boolean(linkedRun?.turnActive)
  const working = turnActive || create.isPending || send.isPending
  const AgentIcon = agentIcon(
    (chat ? agents.find((agent) => agent.id === chat.agentDefinitionId) : selectedAgent)
      ?.icon,
  )

  const submit = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || !selectedAgent || turnActive) return false
    setAgentId(selectedAgent.id)
    try {
      let chatId = selectedId
      if (!chatId) {
        const created = await create.mutateAsync(selectedAgent.id)
        chatId = created.id
        onSelectedIdChange(created.id)
      }
      await send.mutateAsync({ chatId, text: trimmed })
      setDraft('')
      return true
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not send message',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
      return false
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out fill-mode-backwards motion-reduce:animate-none">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <MessageCircle className="size-4 text-muted-foreground" />
        {chat ? (
          <>
            <AgentIcon className="size-4 text-muted-foreground" />
            <p className="min-w-0 truncate font-semibold">
              {agentNameFrom(agents, chat.agentDefinitionId)}
            </p>
            <p className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block">
              {chat.title}
            </p>
          </>
        ) : (
          <Select
            value={selectedAgent?.id}
            onValueChange={(value) => {
              if (typeof value === 'string') setAgentId(value)
            }}
          >
            <SelectTrigger
              size="sm"
              className="w-56"
              aria-label="Agent"
              disabled={working}
            >
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => onSelectedIdChange(undefined)}
        >
          <Plus data-icon="inline-start" />
          New chat
        </Button>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const el = event.currentTarget
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        ref={(node) => {
          if (node && follow.current) node.scrollTop = node.scrollHeight
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {selectedId && isPending && !data ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              <BrailleLoader text="Loading chat" />
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error instanceof Error ? error.message : 'Could not load chat'}
            </p>
          ) : null}
          {!selectedId && !messages.length ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Start a conversation.
            </p>
          ) : null}
          {messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm leading-6">
                  <Markdown>{message.text}</Markdown>
                </div>
              </div>
            ) : (
              <AssistantTurn
                key={message.id}
                text={message.text}
                steps={message.steps}
                runId={message.runId ?? message.id}
              />
            ),
          )}
          {turnActive ? (
            <AssistantTurn
              text=""
              steps={liveSteps}
              runId={linkedRun?.id ?? 'live'}
              working
              error={linkedRun?.error}
            />
          ) : null}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4">
        <div className="mx-auto max-w-3xl rounded-xl border bg-background p-2.5 shadow-sm">
          {turnActive && selectedId ? (
            <div className="mb-2 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => void cancel.mutateAsync(selectedId)}
                disabled={cancel.isPending}
              >
                <Ban data-icon="inline-start" />
                Stop
              </Button>
            </div>
          ) : null}
          <MessageComposer
            key={selectedId ?? 'new'}
            value={draft}
            onChange={setDraft}
            onSubmit={async (text) => submit(text)}
            disabled={working || !selectedAgent}
            roomName="chat"
            mentionableAccounts={[]}
            hideMentions
            hideAttachments
            placeholder="Message"
          />
        </div>
      </div>
    </div>
  )
}
