import type { AgentProvider, AgentRequest } from "../agents";
import type { OpenAICompatibleModel } from "../runtime/openai-agents";
import type { AgentRole } from "../roles/software-engineer";

export function createOpenAIAgentsRuntime(options: {
  role: AgentRole;
  model: OpenAICompatibleModel;
  command?: readonly string[];
}): AgentProvider {
  return {
    run: (sandbox, request: AgentRequest) =>
      sandbox.exec({
        command: options.command ?? ["bun", "run", "/app/runtime/cli.ts"],
        env: {
          SWEAT_AGENT_PROMPT: request.prompt,
          SWEAT_AGENT_ROLE: options.role.id,
          SWEAT_MODEL_BASE_URL: options.model.baseUrl,
          SWEAT_MODEL_API_KEY: options.model.apiKey,
          SWEAT_MODEL_NAME: options.model.model,
        },
      }),
  };
}
