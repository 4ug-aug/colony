import { boundStepText, type Step } from "./step.ts";

export interface CursorCapabilitySession {
  url: string;
  token: string;
  allowedTools: readonly string[];
}

export interface CursorAgentRuntimeRequest {
  task: string;
  instructions: string;
  agentId: string;
  apiKey: string;
  model: string;
  cwd?: string;
  capabilitySession?: CursorCapabilitySession;
}

/** Stable envelope fields from Cursor SDK stream events. Payloads are unknown. */
export type CursorSdkMessage =
  | {
      type: "assistant";
      message: {
        content: Array<
          | { type: "text"; text: string }
          | { type: "tool_use"; id?: string; name?: string; input?: unknown }
        >;
      };
    }
  | {
      type: "thinking";
      text?: string;
    }
  | {
      type: "tool_call";
      call_id: string;
      name: string;
      status: "running" | "completed" | "error";
      args?: unknown;
      result?: unknown;
    }
  | { type: string; [key: string]: unknown };

export interface CursorSdkRun {
  stream(): AsyncIterable<CursorSdkMessage>;
  wait(): Promise<{ status: string; result?: string }>;
}

export interface CursorSdkAgent {
  send(prompt: string): Promise<CursorSdkRun>;
  [Symbol.asyncDispose]?(): PromiseLike<void>;
}

export type CursorAgentFactory = (options: {
  apiKey: string;
  model: { id: string };
  local: {
    cwd: string;
    settingSources?: readonly string[];
  };
  mcpServers?: Record<
    string,
    {
      type: "http";
      url: string;
      headers: Record<string, string>;
    }
  >;
}) => Promise<CursorSdkAgent>;

export function assistantText(message: Extract<CursorSdkMessage, { type: "assistant" }>): string {
  return message.message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** Maps non-assistant Cursor stream events to Sweat steps (assistant is coalesced in runCursorAgent). */
export function mapCursorEventToSteps(event: CursorSdkMessage): Step[] {
  const at = Date.now();
  if (event.type === "thinking" || event.type === "assistant") return [];
  if (event.type === "tool_call") {
    const toolEvent = event as Extract<CursorSdkMessage, { type: "tool_call" }>;
    if (toolEvent.status === "running") {
      return [
        {
          kind: "tool_call",
          tool: toolEvent.name,
          callId: toolEvent.call_id,
          text: boundStepText(toolEvent.args ?? {}),
          at,
        },
      ];
    }
    if (toolEvent.status === "completed" || toolEvent.status === "error") {
      return [
        {
          kind: "tool_result",
          tool: toolEvent.name,
          callId: toolEvent.call_id,
          text: boundStepText(toolEvent.result ?? ""),
          at,
        },
      ];
    }
  }
  return [];
}

/**
 * Clears Cursor credentials from the process environment so local SDK shell
 * tools (which inherit process env) cannot observe them. Returns the key for
 * passing exclusively via the SDK `apiKey` option.
 */
export function takeCursorApiKeyFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const apiKey = env.SWEAT_CURSOR_API_KEY ?? env.CURSOR_API_KEY;
  scrubCursorApiKeysFromEnv(env);
  if (!apiKey) throw new Error("SWEAT_CURSOR_API_KEY is required");
  return apiKey;
}

/** Remove Cursor key material from env; does not read a key value. */
export function scrubCursorApiKeysFromEnv(
  env: Record<string, string | undefined> = process.env,
): void {
  delete env.SWEAT_CURSOR_API_KEY;
  delete env.CURSOR_API_KEY;
}

export async function runCursorAgent(
  request: CursorAgentRuntimeRequest,
  dependencies: {
    createAgent?: CursorAgentFactory;
    onStep?: (step: Step) => void;
  } = {},
): Promise<string> {
  // Key travels only on the request; scrub residual env so shell tools cannot see it.
  scrubCursorApiKeysFromEnv();

  const createAgent =
    dependencies.createAgent ??
    (async (options) => {
      const { Agent } = await import("@cursor/sdk");
      return Agent.create(options) as Promise<CursorSdkAgent>;
    });

  const mcpServers = request.capabilitySession
    ? {
        sweat: {
          type: "http" as const,
          url: request.capabilitySession.url,
          headers: {
            Authorization: `Bearer ${request.capabilitySession.token}`,
          },
        },
      }
    : undefined;

  const agent = await createAgent({
    apiKey: request.apiKey,
    model: { id: request.model },
    local: {
      cwd: request.cwd ?? "/work",
      // Project settings load workspace-staged and repo `.cursor` skills/rules.
      settingSources: ["project"],
    },
    ...(mcpServers ? { mcpServers } : {}),
  });

  const prompt = `${request.instructions}\n\nTask:\n${request.task}`;
  let lastMessageText: string | undefined;
  // Cursor streams assistant text as many small delta events. Coalesce into one
  // Sweat message step per narration turn (flush on tool events / stream end).
  let pendingMessage = "";

  const flushPendingMessage = (): void => {
    if (!pendingMessage) return;
    lastMessageText = pendingMessage;
    dependencies.onStep?.({
      kind: "message",
      text: pendingMessage,
      at: Date.now(),
    });
    pendingMessage = "";
  };

  try {
    const run = await agent.send(prompt);
    for await (const event of run.stream()) {
      if (event.type === "thinking") continue;
      if (event.type === "assistant") {
        pendingMessage += assistantText(event);
        continue;
      }
      flushPendingMessage();
      for (const step of mapCursorEventToSteps(event)) {
        dependencies.onStep?.(step);
      }
    }
    flushPendingMessage();
    const result = await run.wait();
    if (result.status === "error") {
      throw new Error(`Cursor run failed with status ${result.status}`);
    }
    if (result.status === "cancelled") {
      throw new Error("Cursor run was cancelled");
    }
    const finalOutput = result.result ?? "";
    if (
      dependencies.onStep &&
      finalOutput &&
      finalOutput !== lastMessageText
    ) {
      dependencies.onStep({
        kind: "message",
        text: finalOutput,
        at: Date.now(),
      });
    }
    return finalOutput || lastMessageText || "";
  } finally {
    if (agent[Symbol.asyncDispose]) {
      await agent[Symbol.asyncDispose]();
    }
  }
}
