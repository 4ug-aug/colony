import { formatIssueId } from '#/features/issues/format'
import { isFailedToolResult, pairSteps } from '#/features/runs/run-activity'
import type { Step } from '#/features/runs/step-label'

export type OneshotToolPeek = {
  key: string
  label: string
  tool: string
  issueId?: string
  href?: string
}

type PeekHandler = (
  input: { args: string; result: string },
) => Omit<OneshotToolPeek, 'tool'> | null

const handlers: Record<string, PeekHandler> = {
  'workspace.create_issue': createdIssuePeek,
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  return value as Record<string, unknown>
}

function contentText(part: unknown): string | undefined {
  const record = asRecord(part)
  if (!record) return
  let text: unknown = record.text
  const nested = asRecord(text)
  if (nested) text = nested.text
  return typeof text === 'string' ? text : undefined
}

function unwrapMcpText(value: unknown): unknown {
  const outer = asRecord(value)
  if (outer?.isError === true || outer?.status === 'error') return
  const body = outer && 'value' in outer ? outer.value : value
  const envelope = asRecord(body)
  if (envelope?.isError === true) return
  const content = envelope?.content ?? (Array.isArray(body) ? body : undefined)
  if (!Array.isArray(content) || content.length === 0) return body
  const text = contentText(content[0])
  if (text === undefined) return body
  return parseJson(text) ?? text
}

function createdIssuePeek(input: { result: string }): Omit<OneshotToolPeek, 'tool'> | null {
  const parsed = parseJson(input.result)
  if (parsed === undefined) return null
  const issue = unwrapMcpText(parsed)
  if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return null
  const { id, number, title } = issue as Record<string, unknown>
  if (typeof id !== 'string' || !id.trim()) return null
  if (typeof number !== 'number' || !Number.isFinite(number)) return null
  if (typeof title !== 'string') return null
  const ref = formatIssueId(number)
  const trimmed = title.trim()
  return {
    key: id,
    label: trimmed ? `${ref} ${trimmed}` : ref,
    issueId: id,
  }
}

function toolNameFromStep(step: Step): string {
  const fallback = step.tool ?? ''
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

/** OpenAI sanitizes `workspace.create_issue` to `workspace_create_issue`. */
function normalizeToolName(name: string): string {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed || trimmed.includes('.')) return trimmed
  const index = trimmed.indexOf('_')
  if (index <= 0) return trimmed
  return `${trimmed.slice(0, index)}.${trimmed.slice(index + 1)}`
}

export function oneshotPeeks(steps: Step[]): OneshotToolPeek[] {
  const peeks: OneshotToolPeek[] = []
  for (const item of pairSteps(steps)) {
    if (item.step.kind !== 'tool_call' || !item.result) continue
    if (isFailedToolResult(item.result.text)) continue
    const tool = normalizeToolName(toolNameFromStep(item.step))
    const handler = handlers[tool]
    if (!handler) continue
    const peek = handler({ args: item.step.text, result: item.result.text })
    if (peek) peeks.push({ ...peek, tool })
  }
  return peeks
}
