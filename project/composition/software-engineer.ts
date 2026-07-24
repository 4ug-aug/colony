import { createAgentRunner, type AgentRunner } from "../agents";
import { createAppleContainerSandboxProvider } from "../providers/apple-container-sandbox";
import { createOpenAIAgentsRuntime } from "../providers/openai-agents-runtime";
import { softwareEngineerRole } from "../roles/software-engineer";
import {
  createAppleContainerClient,
  type AppleContainerClient,
} from "../sdk/src";
import type {
  McpSessionBinding,
  OpenAICompatibleModel,
} from "../runtime/openai-agents";

export function createSoftwareEngineerRunner(options: {
  model: OpenAICompatibleModel;
  mcp?: McpSessionBinding;
  container?: AppleContainerClient;
  createId?: () => string;
}): AgentRunner {
  const container = options.container ?? createAppleContainerClient();

  return createAgentRunner({
    sandboxes: createAppleContainerSandboxProvider({
      container,
      createId: options.createId,
    }),
    agent: createOpenAIAgentsRuntime({
      role: softwareEngineerRole,
      model: options.model,
      mcp: options.mcp,
    }),
  });
}
