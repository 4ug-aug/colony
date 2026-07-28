export type Step = {
  id: string
  runId: string
  roomId: string
  idx: number
  kind: 'message' | 'tool_call' | 'tool_result'
  tool?: string
  callId?: string
  text: string
  createdAt: number
}

export function stepLabel(step: Step): string {
  if (step.kind === 'message') return 'is reasoning'
  if (step.kind === 'tool_result') return 'is working'
  // tool_call
  const tool = step.tool ?? ''
  if (tool === 'shell') {
    try {
      const args = JSON.parse(step.text) as { command?: string }
      const cmd = (args.command ?? '').slice(0, 40)
      return `is running \`${cmd}\``
    } catch {
      return 'is using shell'
    }
  }
  const humanized = tool.includes('.') ? tool.split('.')[0] : tool
  return `is using ${humanized}`
}
