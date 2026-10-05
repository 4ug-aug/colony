export type Step = {
  id: string
  runId: string
  roomId?: string
  idx: number
  kind: 'message' | 'tool_call' | 'tool_result'
  tool?: string
  callId?: string
  text: string
  createdAt: number
}

/** Tools whose name doesn't read as a verb and object. */
const PHRASES: Record<string, string> = {
  apply_patch: 'is editing files',
  compact_context: 'is compacting its context',
  load_skill: 'is loading a skill',
  'web.search': 'is searching the web',
  'web.fetch': 'is reading a web page',
}

/** Capability namespaces as they read in a sentence; `workspace` is Colony itself. */
const PLACES: Record<string, string> = {
  workspace: '',
  github: 'GitHub',
  linear: 'Linear',
  asana: 'Asana',
  outline: 'Outline',
  grafana: 'Grafana',
  paymo: 'Paymo',
  postgres: 'Postgres',
}

const DOUBLED = new Set(['get', 'set', 'put', 'run'])

function gerund(verb: string): string {
  if (DOUBLED.has(verb)) return `${verb}${verb.at(-1)}ing`
  if (verb.endsWith('e') && !verb.endsWith('ee'))
    return `${verb.slice(0, -1)}ing`
  return `${verb}ing`
}

function shellCommand(text: string): string | undefined {
  try {
    const args = JSON.parse(text) as { command?: unknown; cmd?: unknown }
    const command = args.command ?? args.cmd
    const line = Array.isArray(command) ? command.join(' ') : command
    return typeof line === 'string' ? line.slice(0, 40) : undefined
  } catch {
    return undefined
  }
}

/** "workspace.list_issues" (or "workspace_list_issues") → "is listing issues". */
function toolLabel(tool: string): string {
  const phrase = PHRASES[tool]
  if (phrase) return phrase
  const [namespace, ...rest] = tool.split('.')
  const underscored = !rest.length && tool.split('_')[0]
  const [place, action] =
    rest.length > 0
      ? [namespace!, rest.join('.')]
      : underscored && underscored in PLACES
        ? [underscored, tool.slice(underscored.length + 1)]
        : [undefined, undefined]
  if (!place || !action) return `is using ${namespace}`
  const [verb, ...object] = action.split(/[._]/)
  const where = PLACES[place] ?? place
  return [`is ${gerund(verb!)}`, ...object, where && `in ${where}`]
    .filter(Boolean)
    .join(' ')
}

export function stepLabel(step: Step): string {
  if (step.kind === 'message') return 'is reasoning'
  if (step.kind === 'tool_result') return 'is working'
  const tool = step.tool ?? ''
  if (tool === 'shell' || tool === 'exec_command') {
    const command = shellCommand(step.text)
    return command ? `is running \`${command}\`` : 'is using shell'
  }
  return toolLabel(tool)
}
