import type { AgentProvider, RuntimeRequest } from "../runs";
import {
  capabilitySessionEnv,
  createStdoutStepRuntime,
} from "./stdout-step-runtime";

/**
 * A host-local model URL means the host running Colony, not the guest. Which
 * name reaches it is the sandbox's to know: a container resolves
 * `host.container.internal`, a microVM guest has that as NXDOMAIN and reaches
 * the host on the default route it reports (loopback under TSI). Guessing the
 * container name for every sandbox is what made antboy fail with the OpenAI
 * SDK's "Connection error." once it moved off containers.
 */
function guestModelBaseUrl(baseUrl: string, hostGateway?: string): string {
  const url = new URL(baseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    return baseUrl;
  url.hostname = hostGateway ?? "host.container.internal";
  return url.toString().replace(/\/$/, "");
}

export function createOpenAIAgentsRuntime(options: {
  command?: readonly string[];
} = {}): AgentProvider {
  const command = options.command ?? (["bun", "run", "/app/runtime/cli.ts"] as const);

  return createStdoutStepRuntime({
    command: () => command,
    env: (request: RuntimeRequest, sandbox) => {
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
        SWEAT_MODEL_BASE_URL: guestModelBaseUrl(model.baseUrl, sandbox.hostGateway),
        SWEAT_MODEL_API_KEY: model.apiKey,
        SWEAT_MODEL_NAME: model.model,
        SWEAT_SKILLS_ROOT: "/work/.agents/skills",
        ...capabilitySessionEnv(request),
      };
    },
  });
}
