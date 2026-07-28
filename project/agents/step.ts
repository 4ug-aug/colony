// Step wire contract shared between the platform and the container runtime.
// This module MUST stay dependency-free: the container image copies only this
// file (not the rest of the agents module, which pulls in the executor,
// sandbox provider, and MCP gateway).

export type StepKind = 'message' | 'tool_call' | 'tool_result';

export interface Step {
  kind: StepKind;
  // message: the narration text. tool_call: the arguments (JSON string).
  // tool_result: the tool output.
  text: string;
  tool?: string;     // tool_call / tool_result only, e.g. "shell"
  callId?: string;   // correlates a tool_call with its tool_result
  at: number;        // ms epoch, set in the container
}

export function serializeStep(step: Step): string {
  const line = JSON.stringify(step);
  // JSON.stringify escapes \n inside strings, so the result must be single-line.
  if (line.includes('\n')) throw new Error("serializeStep produced a line with embedded newlines");
  return line;
}

export function parseStep(line: string): Step | undefined {
  if (!line.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj['kind'] !== 'string') return undefined;
  const kind = obj['kind'];
  if (kind !== 'message' && kind !== 'tool_call' && kind !== 'tool_result') return undefined;
  if (typeof obj['text'] !== 'string') return undefined;
  if (typeof obj['at'] !== 'number') return undefined;
  const step: Step = { kind: kind as StepKind, text: obj['text'] as string, at: obj['at'] as number };
  if (typeof obj['tool'] === 'string') step.tool = obj['tool'];
  if (typeof obj['callId'] === 'string') step.callId = obj['callId'];
  return step;
}
