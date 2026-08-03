import type { AgentProvider, RuntimeRequest } from "../runs";
import {
  capabilitySessionEnv,
  createStdoutStepRuntime,
} from "./stdout-step-runtime";

function containerModelBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    return baseUrl;
  url.hostname = "host.container.internal";
  return url.toString().replace(/\/$/, "");
}

export function createOpenAIAgentsRuntime(options: {
  command?: readonly string[];
} = {}): AgentProvider {
  const command = options.command ?? (["bun", "run", "/app/runtime/cli.ts"] as const);

  return createStdoutStepRuntime({
    command: () => command,
    env: (request: RuntimeRequest) => {
      const runtime = request.definition.runtime;
      if (runtime.kind !== "openai-agents") {
        throw new Error(
          `Agent definition ${request.definition.id} is not an OpenAI Agents runtime`,
        );
      }
      const { model } = runtime;
      return {
        SWEAT_AGENT_TASK: request.task,
        SWEAT_AGENT_ID: request.definition.id,
        SWEAT_AGENT_INSTRUCTIONS: request.definition.instructions,
        SWEAT_MODEL_PROVIDER: model.provider ?? "openai",
        SWEAT_MODEL_BASE_URL: containerModelBaseUrl(model.baseUrl),
        SWEAT_MODEL_API_KEY: model.apiKey,
        SWEAT_MODEL_NAME: model.model,
        ...capabilitySessionEnv(request),
      };
    },
  });
}
