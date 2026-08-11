import { cn } from '#/lib/utils'
import {
  formatStepText,
  isFailedToolResult,
  type ActivityItem,
} from './run-activity'
import { ToolIcon } from './run-tool-icon'

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
    <div className="overflow-hidden rounded-sm border divide-y">
      {items.map(({ step, result }) => {
        const name = toolName(step)
        const failed = result ? isFailedToolResult(result.text) : false
        const argsText = formatStepText(step.text)
        const resultText = result
          ? formatStepText(result.text)
          : undefined
        const shownResult =
          resultText && resultMaxLength !== undefined
            ? resultText.slice(0, resultMaxLength)
            : resultText
        return (
          <details
            key={step.id}
            className={cn(
              'group text-xs animate-in fade-in-0 slide-in-from-bottom-1 duration-300 fill-mode-both motion-reduce:animate-none',
              compact ? 'px-2.5 py-2' : 'px-3 py-2',
            )}
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
            <div
              className={cn(
                'text-xs group-open:animate-in group-open:fade-in-0 group-open:slide-in-from-top-1 group-open:duration-200',
                compact ? 'mt-2 space-y-2' : 'mt-3 space-y-3',
              )}
            >
              {argsText && argsText !== '{}' ? (
                <div>
                  <p className="mb-1 font-semibold text-muted-foreground">
                    Arguments
                  </p>
                  <pre
                    className={cn(
                      'overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted font-mono leading-4',
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
                  <p className="mb-1 font-semibold text-muted-foreground">
                    Result
                  </p>
                  <pre
                    className={cn(
                      'overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted font-mono leading-4',
                      compact
                        ? 'max-h-28 px-2 py-1.5 text-[0.7rem]'
                        : 'overflow-x-auto px-3 py-2 text-xs leading-5',
                    )}
                  >
                    {shownResult}
                  </pre>
                </div>
              ) : null}
            </div>
          </details>
        )
      })}
    </div>
  )
}
