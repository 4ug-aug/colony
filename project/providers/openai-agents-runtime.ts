import type { AgentProvider, AgentRequest } from "../agents";
import type {
  McpSessionBinding,
  OpenAICompatibleModel,
} from "../runtime/openai-agents";
import type { AgentRole } from "../roles/software-engineer";

export function createOpenAIAgentsRuntime(options: {
  role: AgentRole;
  model: OpenAICompatibleModel;
  mcp?: McpSessionBinding;
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
          SWEAT_MCP_URL: options.mcp?.url,
          SWEAT_MCP_TOKEN: options.mcp?.token,
          SWEAT_MCP_ALLOWED_TOOLS: options.mcp?.allowedTools?.join(","),
        },
      }),
  };
}
