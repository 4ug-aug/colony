import type { AgentProvider, RuntimeRequest } from "../agents";

export function createOpenAIAgentsRuntime(options: {
  command?: readonly string[];
} = {}): AgentProvider {
  return {
    run: (sandbox, request: RuntimeRequest) => {
      const model = request.definition.runtime.model;
      if (!model) {
        throw new Error(`Agent definition ${request.definition.id} has no model configuration`);
      }
      return sandbox.exec({
        command: options.command ?? ["bun", "run", "/app/runtime/cli.ts"],
        env: {
          SWEAT_AGENT_TASK: request.task,
          SWEAT_AGENT_ID: request.definition.id,
          SWEAT_AGENT_INSTRUCTIONS: request.definition.instructions,
          SWEAT_MODEL_BASE_URL: model.baseUrl,
          SWEAT_MODEL_API_KEY: model.apiKey,
          SWEAT_MODEL_NAME: model.model,
          ...(request.capabilitySession
            ? {
                SWEAT_MCP_URL: request.capabilitySession.url,
                SWEAT_MCP_TOKEN: request.capabilitySession.token,
                SWEAT_MCP_ALLOWED_TOOLS: request.capabilitySession.allowedTools.join(","),
              }
            : {}),
        },
        ...(request.workspace ? { workdir: request.workspace } : {}),
        ...(request.onOutput ? { onOutput: request.onOutput } : {}),
      });
    },
  };
}
