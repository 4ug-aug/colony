import {
  Agent,
  type Model,
  type ModelProvider,
  OpenAIProvider,
  Runner,
  tool,
} from "@openai/agents";
import { softwareEngineerRole } from "../roles/software-engineer";

export interface OpenAICompatibleModel {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AgentRuntimeRequest {
  prompt: string;
  role: "software-engineer";
  model: OpenAICompatibleModel;
}

export function normalizeModelBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.hostname === "api.openai.com" && url.pathname === "/") {
    url.pathname = "/v1";
  }
  return url.toString().replace(/\/$/, "");
}

function shellEnvironment(): Record<string, string | undefined> {
  const env = { ...Bun.env };
  delete env.SWEAT_MODEL_API_KEY;
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

export async function runAgent(
  request: AgentRuntimeRequest,
  dependencies: { model?: Model; modelProvider?: ModelProvider } = {},
): Promise<string> {
  if (request.role !== softwareEngineerRole.id) {
    throw new Error(`Unknown agent role: ${request.role}`);
  }

  const agent = new Agent({
    name: softwareEngineerRole.id,
    instructions: softwareEngineerRole.instructions,
    model: dependencies.model ?? request.model.model,
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
          runShell((input as { command: string }).command),
      }),
    ],
  });

  const result = await new Runner({
    modelProvider:
      dependencies.modelProvider ??
      new OpenAIProvider({
        apiKey: request.model.apiKey,
        baseURL: normalizeModelBaseUrl(request.model.baseUrl),
        useResponses: false,
      }),
    tracingDisabled: true,
  }).run(agent, request.prompt);

  return result.finalOutput ?? "";
}
