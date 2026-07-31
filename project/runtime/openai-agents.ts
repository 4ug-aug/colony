import {
  Agent,
  MCPServers,
  MCPServerStreamableHttp,
  type Model,
  type ModelProvider,
  OpenAIProvider,
  Runner,
  tool,
} from "@openai/agents";

import type { Step } from "./step";
import type { CapabilitySessionBinding } from "../mcp/session";

export interface OpenAICompatibleModel {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AgentRuntimeRequest {
  task: string;
  instructions: string;
  agentId: string;
  model: OpenAICompatibleModel;
  capabilitySession?: CapabilitySessionBinding;
}

export function normalizeModelBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.hostname === "api.openai.com" && url.pathname === "/") {
    url.pathname = "/v1";
  }
  return url.toString().replace(/\/$/, "");
}

export function toolOutputText(output: unknown): string {
  if (typeof output === "string") return output;
  try {
    const json = JSON.stringify(output, null, 2);
    if (json !== undefined) return json;
  } catch {
    // Fall through for circular or otherwise non-JSON values.
  }
  return String(output);
}

function shellEnvironment(): Record<string, string | undefined> {
  const env = { ...Bun.env };
  delete env.SWEAT_MODEL_API_KEY;
  delete env.SWEAT_MCP_TOKEN;
  delete env.OPENAI_API_KEY;
  return env;
}

async function runShell(command: string): Promise<string> {
  const process = Bun.spawn(["sh", "-lc", command], {
    env: shellEnvironment(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  return JSON.stringify({
    exitCode,
    stdout: stdout.slice(0, 20_000),
    stderr: stderr.slice(0, 20_000),
  });
}

function shellCommand(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Shell command is required");
  const command = Object.entries(input).find(([name]) => name === "command")?.[1];
  if (typeof command !== "string") throw new Error("Shell command is required");
  return command;
}

export async function runAgent(
  request: AgentRuntimeRequest,
  dependencies: {
    model?: Model;
    modelProvider?: ModelProvider;
    onStep?: (step: Step) => void;
  } = {},
): Promise<string> {
  const mcpServers = request.capabilitySession
    ? await MCPServers.open([
        new MCPServerStreamableHttp({
          name: "capabilities",
          url: request.capabilitySession.url,
          requestInit: {
            headers: { Authorization: `Bearer ${request.capabilitySession.token}` },
          },
          toolFilter: { allowedToolNames: [...request.capabilitySession.allowedTools] },
          timeout: 5 * 60_000,
        }),
      ], { strict: true })
    : undefined;
  const agent = new Agent({
    name: request.agentId,
    instructions: request.instructions,
    model: dependencies.model ?? request.model.model,
    mcpServers: mcpServers?.active,
    tools: [
      tool({
        name: "shell",
        description: "Run one shell command in the current sandbox.",
        parameters: {
          type: "object",
          properties: { command: { type: "string" } },
          required: ["command"],
          additionalProperties: false,
        },
        strict: true,
        execute: async (input) =>
          runShell(shellCommand(input)),
      }),
    ],
  });

  try {
    const result = await new Runner({
      modelProvider:
        dependencies.modelProvider ??
        new OpenAIProvider({
          apiKey: request.model.apiKey,
          baseURL: normalizeModelBaseUrl(request.model.baseUrl),
          useResponses: true,
        }),
      tracingDisabled: true,
    }).run(agent, request.task, { maxTurns: 50, stream: true });

    let lastMessageText: string | undefined;

    for await (const event of result) {
      if (event.type !== "run_item_stream_event") continue;
      const { name, item } = event;
      if (name === "message_output_created") {
        const text = (item as { content: string }).content;
        lastMessageText = text;
        dependencies.onStep?.({ kind: "message", text, at: Date.now() });
      } else if (name === "tool_called") {
        const toolItem = item as { toolName?: string; callId?: string; rawItem: { arguments: string } };
        dependencies.onStep?.({
          kind: "tool_call",
          tool: toolItem.toolName ?? "",
          text: toolItem.rawItem.arguments,
          callId: toolItem.callId,
          at: Date.now(),
        });
      } else if (name === "tool_output") {
        const outputItem = item as { output: unknown; callId?: string; rawItem: { type?: string; name?: string } };
        const rawItem = outputItem.rawItem;
        const toolName = rawItem.type === "function_call_result" && typeof rawItem.name === "string" ? rawItem.name : "";
        dependencies.onStep?.({
          kind: "tool_result",
          tool: toolName,
          text: toolOutputText(outputItem.output),
          callId: outputItem.callId,
          at: Date.now(),
        });
      }
    }
    await result.completed;

    const finalOutput = result.finalOutput ?? "";
    if (dependencies.onStep && finalOutput && finalOutput !== lastMessageText) {
      dependencies.onStep({ kind: "message", text: finalOutput, at: Date.now() });
    }

    return finalOutput;
  } finally {
    await mcpServers?.close();
  }
}
