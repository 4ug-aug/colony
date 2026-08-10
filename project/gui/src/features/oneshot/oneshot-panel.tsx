import { AgentAnt } from '#/components/avatar'
import { Markdown } from '#/components/markdown'
import { Badge } from '#/components/ui/badge'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Kbd, KbdGroup } from '#/components/ui/kbd'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import { toast } from '#/components/ui/toast'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import { formatStepText, isFailedToolResult, pairSteps } from '#/features/runs/run-activity'
import { terminal } from '#/features/runs/run-helpers'
import { ToolIcon } from '#/features/runs/run-tool-icon'
import { stepLabel, type Step } from '#/features/runs/step-label'
import { useWindowKeydown } from '#/hooks/use-window-keydown'
import { cn } from '#/lib/utils'
import { Check, Copy, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { OneshotRun, OneshotRunStep } from './types'
import {
  useDiscardOneshot,
  useLastOneshotAgent,
  useOneshot,
  useStartOneshot,
} from './use-oneshot'

const DEFAULT_AGENT_ID = 'software-engineer'

const isApplePlatform = (): boolean =>
  /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

function asStep(step: OneshotRunStep): Step {
  return {
    id: step.id,
    runId: step.runId,
    roomId: '',
    idx: step.idx,
    kind: step.kind,
    ...(step.tool === undefined ? {} : { tool: step.tool }),
    ...(step.callId === undefined ? {} : { callId: step.callId }),
    text: step.text,
    createdAt: step.createdAt,
  }
}

function toolDisplay(step: OneshotRunStep): {
  name: string
  argsText: string
} {
  const fallback = step.tool ?? 'Tool call'
  if (!step.text.trim()) return { name: fallback, argsText: '' }
  try {
    const parsed = JSON.parse(step.text) as {
      toolName?: unknown
      args?: unknown
    }
    if (typeof parsed.toolName === 'string' && parsed.toolName.trim()) {
      return {
        name: parsed.toolName,
        argsText: formatStepText(JSON.stringify(parsed.args ?? {})),
      }
    }
  } catch {
    // plain / non-MCP tool args
  }
  return { name: fallback, argsText: formatStepText(step.text) }
}

function workingLabel(run: OneshotRun, steps: OneshotRunStep[]): string {
  const latest = steps.at(-1)
  if (latest) {
    if (latest.kind === 'tool_call') {
      const { name } = toolDisplay(latest)
      return stepLabel({ ...asStep(latest), tool: name })
    }
    return stepLabel(asStep(latest))
  }
  return run.state === 'preparing' ? 'is preparing' : 'is working'
}

function OneshotStream({
  run,
  steps,
  error,
}: {
  run: OneshotRun
  steps: OneshotRunStep[]
  error?: string
}) {
  const done = terminal(run.state)
  const finalOutput = run.stdout.trim() || run.error?.trim()
  const toolItems = pairSteps(steps.map(asStep)).filter(
    (item) => item.step.kind === 'tool_call',
  )

  return (
    <div
      ref={(node) => {
        if (node) node.scrollTop = node.scrollHeight
      }}
      className="min-h-0 flex-1 space-y-2 overflow-y-auto text-sm border rounded-md p-2 dark:bg-background"
    >
      {error ? <p className="text-destructive">{error}</p> : null}
      {toolItems.length > 0 ? (
        <div className="overflow-hidden rounded-sm border divide-y">
          {toolItems.map(({ step, result }) => {
            const { name, argsText } = toolDisplay({
              id: step.id,
              runId: step.runId,
              idx: step.idx,
              kind: 'tool_call',
              tool: step.tool,
              callId: step.callId,
              text: step.text,
              createdAt: step.createdAt,
              at: step.createdAt,
            })
            const failed = result ? isFailedToolResult(result.text) : false
            return (
              <details
                key={step.id}
                className="group px-2.5 py-2 text-xs animate-in fade-in-0 slide-in-from-bottom-1 duration-300 fill-mode-both motion-reduce:animate-none"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium">
                  <span className="flex min-w-0 items-center gap-2">
                    <ToolIcon tool={name} />
                    <span className="truncate font-mono text-xs">{name}</span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px]',
                      failed
                        ? 'bg-destructive/15 text-destructive'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {result ? (failed ? 'Failed' : 'Completed') : 'Pending'}
                  </span>
                </summary>
                <div className="mt-2 space-y-2 text-xs">
                  {argsText && argsText !== '{}' ? (
                    <div>
                      <p className="mb-1 font-semibold text-muted-foreground">
                        Arguments
                      </p>
                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted px-2 py-1.5 font-mono text-[0.7rem] leading-4">
                        {argsText}
                      </pre>
                    </div>
                  ) : null}
                  {result ? (
                    <div>
                      <p className="mb-1 font-semibold text-muted-foreground">
                        Result
                      </p>
                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted px-2 py-1.5 font-mono text-[0.7rem] leading-4">
                        {formatStepText(result.text).slice(0, 800)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </details>
            )
          })}
        </div>
      ) : null}
      {done && finalOutput ? (
        <div
          className={cn(
            'text-sm leading-5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 fill-mode-both motion-reduce:animate-none',
            run.state === 'failed' || run.state === 'cancelled'
              ? 'rounded-md border border-destructive/40 px-2 py-1.5 text-destructive'
              : null,
          )}
        >
          {run.state === 'succeeded' ? (
            <div className="[&_p]:mb-1 [&_p:last-child]:mb-0">
              <Markdown>{finalOutput}</Markdown>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{finalOutput}</p>
          )}
        </div>
      ) : null}
      {!done && toolItems.length === 0 && !error ? (
        <p className="text-xs text-muted-foreground">Starting…</p>
      ) : null}
    </div>
  )
}

export function OneshotPanel({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: agents = [] } = useAgentDefinitions()
  const [agentId, setAgentId] = useLastOneshotAgent(
    agents[0]?.id ?? DEFAULT_AGENT_ID,
  )
  const [task, setTask] = useState('')
  const [revision, setRevision] = useState('')
  const [runId, setRunId] = useState<string>()
  const [copied, setCopied] = useState(false)
  const taskRef = useRef<HTMLTextAreaElement>(null)
  const start = useStartOneshot()
  const discard = useDiscardOneshot()
  const { data, isError, error } = useOneshot(runId)

  const selectedAgent =
    agents.find((agent) => agent.id === agentId) ?? agents[0]
  const showRevision = selectedAgent?.includeRepository === true
  const run = data?.run
  const steps = data?.steps ?? []
  const active = Boolean(runId)
  const working = Boolean(run && !terminal(run.state)) || start.isPending
  const agentName = selectedAgent?.name ?? run?.agentId ?? 'Agent'
  const finalOutput = run?.stdout.trim() || ''
  const canCopyFinal = Boolean(
    run && terminal(run.state) && run.state === 'succeeded' && finalOutput,
  )

  const copyFinal = async () => {
    if (!finalOutput) return
    try {
      await navigator.clipboard.writeText(finalOutput)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
      toast.add({ title: 'Copied', type: 'success' })
    } catch {
      toast.add({ title: 'Copy failed', type: 'error' })
    }
  }

  const close = async () => {
    if (runId) {
      try {
        await discard.mutateAsync(runId)
      } catch (reason) {
        toast.add({
          type: 'error',
          title: 'Could not close Oneshot',
          description:
            reason instanceof Error ? reason.message : 'Please try again.',
        })
        return
      }
    }
    setRunId(undefined)
    setTask('')
    onOpenChange(false)
  }

  const submit = async () => {
    const trimmed = task.trim()
    if (!trimmed || !selectedAgent || active || start.isPending) return
    try {
      setAgentId(selectedAgent.id)
      setCopied(false)
      const created = await start.mutateAsync({
        task: trimmed,
        agentDefinitionId: selectedAgent.id,
        ...(showRevision && revision.trim()
          ? { repositoryBase: revision.trim() }
          : {}),
      })
      setRunId(created.id)
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not start Oneshot',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  useWindowKeydown((event) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
      return
    const key = event.key.toLowerCase()
    if (key === 'o') {
      event.preventDefault()
      if (open) {
        if (!active) taskRef.current?.focus()
        return
      }
      onOpenChange(true)
      return
    }
    if (key === 'enter' && open && !active) {
      event.preventDefault()
      void submit()
    }
  })

  const [present, setPresent] = useState(open)
  if (open && !present) setPresent(true)

  if (!present) return null

  return (
    <div
      role="dialog"
      aria-label="Oneshot"
      data-state={open ? 'open' : 'closed'}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return
        if (!open) setPresent(false)
      }}
      className={cn(
        'dark:bg-muted fixed right-3 bottom-3 z-50 flex w-[min(100vw-1.5rem,24rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-lg transition-[height] duration-300 ease-out fill-mode-both motion-reduce:animate-none',
        active ? 'h-[min(70vh,28rem)]' : 'h-[min(50vh,20rem)]',
        open
          ? 'animate-in fade-in-0 slide-in-from-bottom-4 duration-200'
          : 'animate-out fade-out-0 slide-out-to-bottom-4 duration-200',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="size-7 shrink-0"
            aria-label="Close Oneshot"
            onClick={() => void close()}
          >
            <X className="size-3.5" />
          </Button>
          {active ? (
            <span
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border bg-muted text-primary"
              title={agentName}
              aria-hidden
            >
              <AgentAnt className="size-4" />
            </span>
          ) : null}
          {working && run ? (
            <BrailleLoader
              className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
              text={`${agentName} ${workingLabel(run, steps)}`}
            />
          ) : working ? (
            <BrailleLoader
              className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
              text={`${agentName} is starting`}
            />
          ) : active && run ? (
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground flex items-center gap-2">
              <span className="font-medium text-foreground/80">{agentName}</span>
              <Badge className="capitalize" variant={run.state === 'succeeded' ? 'default' : run.state === 'failed' ? 'destructive' : 'outline'}>
                {run.state === 'succeeded' ? 'Done' : run.state}
              </Badge>
            </span>
          ) : (
            <>
              <Select
                value={selectedAgent?.id}
                onValueChange={(value) => {
                  if (typeof value === 'string') setAgentId(value)
                }}
              >
                <SelectTrigger
                  id="oneshot-agent"
                  size="sm"
                  className="min-w-0 flex-1"
                  aria-label="Agent"
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
              {showRevision ? (
                <Input
                  id="oneshot-ref"
                  value={revision}
                  onChange={(event) => setRevision(event.target.value)}
                  placeholder="Ref"
                  aria-label="Repository ref"
                  className="h-8 w-24 shrink-0"
                />
              ) : null}
              <Button
                type="button"
                size="sm"
                className="shrink-0 gap-1.5"
                disabled={!task.trim() || start.isPending || !selectedAgent}
                onClick={() => void submit()}
                title={`${isApplePlatform() ? '⌘' : 'Ctrl'}+Enter`}
              >
                Run
                <KbdGroup className="pointer-events-none hidden sm:inline-flex opacity-80">
                  <Kbd className="bg-primary-foreground/15 text-primary-foreground">
                    {isApplePlatform() ? '⌘' : 'Ctrl'}
                  </Kbd>
                  <Kbd className="bg-primary-foreground/15 text-primary-foreground">
                    ↵
                  </Kbd>
                </KbdGroup>
              </Button>
            </>
          )}
          {canCopyFinal ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-7 shrink-0"
              aria-label="Copy final output"
              title="Copy final output"
              onClick={() => void copyFinal()}
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
          ) : null}
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              'absolute inset-0 flex flex-col transition-all duration-300 ease-out',
              active
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-2 opacity-0',
            )}
          >
            {run ? (
              <OneshotStream
                run={run}
                steps={steps}
                error={
                  isError
                    ? error instanceof Error
                      ? error.message
                      : 'Could not load Oneshot'
                    : undefined
                }
              />
            ) : null}
          </div>
          <div
            className={cn(
              'absolute inset-0 transition-all duration-300 ease-out',
              active
                ? 'pointer-events-none translate-y-[110%] opacity-0'
                : 'translate-y-0 opacity-100',
            )}
          >
            <Textarea
              ref={taskRef}
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="What should the agent do?"
              className="h-full min-h-0 resize-none [field-sizing:fixed]"
              autoFocus
              onKeyDown={(event) => {
                if (!(event.metaKey || event.ctrlKey)) return
                if (event.key !== 'Enter' && event.code !== 'Enter') return
                event.preventDefault()
                void submit()
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
