import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import { cn } from '#/lib/utils'
import { ChevronRight } from 'lucide-react'
import {
  formatStepText,
  isFailedToolResult,
  type ActivityItem,
} from './run-activity'
import { ToolIcon } from './run-tool-icon'

const panelClassName =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out motion-reduce:transition-none data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 [&[hidden]:not([hidden='until-found'])]:hidden"

function toolName(step: ActivityItem['step']): string {
  const fallback = step.tool ?? 'Tool call'
  if (!step.text.trim()) return fallback
  try {
    const parsed = JSON.parse(step.text) as { toolName?: unknown }
    if (typeof parsed.toolName === 'string' && parsed.toolName.trim())
      return parsed.toolName
  } catch {
    // plain / non-MCP tool args
  }
  return fallback
}

function statusLabel(result: ActivityItem['result'], failed: boolean): string {
  if (!result) return 'Pending'
  return failed ? 'Failed' : 'Completed'
}

function ToolCallDetailsRow({
  item,
  compact,
  resultMaxLength,
}: {
  item: ActivityItem
  compact: boolean
  resultMaxLength?: number
}) {
  const name = toolName(item.step)
  const failed = item.result ? isFailedToolResult(item.result.text) : false
  const argsText = formatStepText(item.step.text)
  const resultText = item.result
    ? formatStepText(item.result.text)
    : undefined
  const shownResult =
    resultText && resultMaxLength !== undefined
      ? resultText.slice(0, resultMaxLength)
      : resultText

  return (
    <Collapsible className="text-xs text-muted-foreground animate-in fade-in-0 slide-in-from-bottom-1 duration-300 fill-mode-both motion-reduce:animate-none">
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className={cn(
              'group/tool flex w-full cursor-pointer items-center gap-1.5 text-left outline-none',
              compact ? 'py-0.5' : 'py-1',
              failed ? 'text-destructive' : 'hover:text-foreground',
            )}
            aria-label={`${name}, ${statusLabel(item.result, failed)}`}
          />
        }
      >
        <ToolIcon tool={name} />
        <span className="min-w-0 truncate font-mono">{name}</span>
        <ChevronRight
          aria-hidden="true"
          className="size-3 shrink-0 transition-transform duration-200 group-data-[panel-open]/tool:rotate-90 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className={panelClassName}>
        <div
          className={cn(
            'text-xs',
            compact ? 'mt-1.5 space-y-2 pb-1.5 pl-5' : 'mt-2 space-y-3 pb-2 pl-5',
          )}
        >
          {argsText && argsText !== '{}' ? (
            <div>
              <p className="mb-1 font-semibold">Arguments</p>
              <pre
                className={cn(
                  'overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted font-mono leading-4 text-muted-foreground',
                  compact
                    ? 'max-h-28 px-2 py-1.5 text-[0.7rem]'
                    : 'overflow-x-auto px-3 py-2 text-xs leading-5',
                )}
              >
                {argsText}
              </pre>
            </div>
          ) : null}
          {shownResult ? (
            <div>
              <p className="mb-1 font-semibold">Result</p>
              <pre
                className={cn(
                  'overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted font-mono leading-4',
                  compact
                    ? 'max-h-28 px-2 py-1.5 text-[0.7rem]'
                    : 'overflow-x-auto px-3 py-2 text-xs leading-5',
                  failed ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {shownResult}
              </pre>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ToolCallDetailsList({
  items,
  compact = false,
  resultMaxLength,
}: {
  items: ActivityItem[]
  compact?: boolean
  resultMaxLength?: number
}) {
  if (items.length === 0) return null
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <ToolCallDetailsRow
          key={item.step.id}
          item={item}
          compact={compact}
          resultMaxLength={resultMaxLength}
        />
      ))}
    </div>
  )
}
