import {
  Agent,
  MCPServers,
  MCPServerStreamableHttp,
  type Model,
  type ModelRequest,
  type ModelProvider,
  type ModelResponse,
  OpenAIResponsesModel,
  OpenAIProvider,
  type ResponseStreamEvent,
  Runner,
  tool,
  type ToolOutputImage,
} from "@openai/agents";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import OpenAI from "openai";

import type { Step } from "./step";
import type { CapabilitySessionBinding } from "../mcp/session";

export interface OpenAICompatibleModel {
  provider?: "openai" | "custom";
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

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
  if (
    output &&
    typeof output === "object" &&
    !Array.isArray(output) &&
    "type" in output &&
    output.type === "image"
  )
    return "[image]";
  try {
    const json = JSON.stringify(output, null, 2);
    if (json !== undefined) return json;
  } catch {
    // Fall through for circular or otherwise non-JSON values.
  }
  return String(output);
}

type TokenDetails = Record<string, number>;
type SanitizableUsage = {
  inputTokensDetails?: TokenDetails | TokenDetails[];
  outputTokensDetails?: TokenDetails | TokenDetails[];
  requestUsageEntries?: Array<{
    inputTokensDetails?: TokenDetails;
    outputTokensDetails?: TokenDetails;
  }>;
};

function numericDetails(details: TokenDetails): TokenDetails {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => typeof value === "number"),
  );
}

export function sanitizeUsageDetails(usage: SanitizableUsage): void {
  if (usage.inputTokensDetails) {
    usage.inputTokensDetails = Array.isArray(usage.inputTokensDetails)
      ? usage.inputTokensDetails.map(numericDetails)
      : numericDetails(usage.inputTokensDetails);
  }
  if (usage.outputTokensDetails) {
    usage.outputTokensDetails = Array.isArray(usage.outputTokensDetails)
      ? usage.outputTokensDetails.map(numericDetails)
      : numericDetails(usage.outputTokensDetails);
  }
  for (const entry of usage.requestUsageEntries ?? []) {
    if (entry.inputTokensDetails) {
      entry.inputTokensDetails = numericDetails(entry.inputTokensDetails);
    }
    if (entry.outputTokensDetails) {
      entry.outputTokensDetails = numericDetails(entry.outputTokensDetails);
    }
  }
}

class CompatibleResponsesModel extends OpenAIResponsesModel {
  override async getResponse(request: ModelRequest): Promise<ModelResponse> {
    const response = await super.getResponse(request);
    sanitizeUsageDetails(response.usage);
    return response;
  }

  override async *getStreamedResponse(
    request: ModelRequest,
  ): AsyncIterable<ResponseStreamEvent> {
    for await (const event of super.getStreamedResponse(request)) {
      if (event.type === "response_done") {
        sanitizeUsageDetails(event.response.usage);
      }
      yield event;
    }
  }
}

export function createModelProvider(
  model: OpenAICompatibleModel,
): ModelProvider {
  const baseURL = normalizeModelBaseUrl(model.baseUrl);
  if (model.provider === "custom") {
    const client = new OpenAI({ apiKey: model.apiKey, baseURL });
    return {
      getModel: (name) =>
        new CompatibleResponsesModel(client, name ?? model.model),
    };
  }
  return new OpenAIProvider({
    apiKey: model.apiKey,
    baseURL,
    useResponses: true,
  });
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

const maxImageBytes = 10 * 1024 * 1024;

function imagePath(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Image path is required");
  const path = Object.entries(input).find(([name]) => name === "path")?.[1];
  if (typeof path !== "string") throw new Error("Image path is required");
  return path;
}

function imageMediaType(bytes: Uint8Array): string | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg";
  if (
    bytes.length >= 6 &&
    String.fromCharCode(...bytes.subarray(0, 6)) in {
      GIF87a: true,
      GIF89a: true,
    }
  )
    return "image/gif";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  return undefined;
}

async function viewImage(
  path: string,
  attachmentRoot: string,
): Promise<ToolOutputImage> {
  const [root, image] = await Promise.all([
    realpath(attachmentRoot),
    realpath(resolve(path)),
  ]);
  const child = relative(root, image);
  if (
    !child ||
    child === ".." ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  )
    throw new Error("Image path must be a staged attachment");
  const info = await stat(image);
  if (!info.isFile()) throw new Error("Image path must be a file");
  if (info.size > maxImageBytes)
    throw new Error("Image exceeds the 10 MiB limit");
  const bytes = new Uint8Array(await readFile(image));
  const mediaType = imageMediaType(bytes);
  if (!mediaType) throw new Error("Unsupported image format");
  return { type: "image", image: { data: bytes, mediaType } };
}

export async function runAgent(
  request: AgentRuntimeRequest,
  dependencies: {
    model?: Model;
    modelProvider?: ModelProvider;
    onStep?: (step: Step) => void;
    attachmentRoot?: string;
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
        name: "view_image",
        description:
          "View a PNG, JPEG, GIF, or WebP attachment from a listed /work/.sweat/attachments path.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
          additionalProperties: false,
        },
        strict: true,
        execute: async (input): Promise<ToolOutputImage | string> => {
          try {
            return await viewImage(
              imagePath(input),
              dependencies.attachmentRoot ??
                resolve(".sweat", "attachments"),
            );
          } catch (error) {
            return `Unable to view image: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),
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
        createModelProvider(request.model),
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
