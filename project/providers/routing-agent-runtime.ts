import type { AgentProvider, RuntimeRequest } from "../runs";
import { createCursorSdkRuntime } from "./cursor-sdk-runtime";
import { createOpenAIAgentsRuntime } from "./openai-agents-runtime";

/**
 * Routes to the Cursor or OpenAI Agents runtime based on definition.runtime.kind.
 */
export function createRoutingAgentRuntime(options: {
  openai?: AgentProvider;
  cursor?: AgentProvider;
} = {}): AgentProvider {
  const openai = options.openai ?? createOpenAIAgentsRuntime({});
  const cursor = options.cursor ?? createCursorSdkRuntime({});
  return {
    run: async (sandbox, request: RuntimeRequest) => {
      const kind = request.definition.runtime.kind;
      if (kind === "cursor") {
        return cursor.run(sandbox, request);
      }
      return openai.run(sandbox, request);
    },
  };
}
