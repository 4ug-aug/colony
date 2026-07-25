import {
  createInMemoryAgentDefinitionResolver,
  createRunExecutor,
  type AgentDefinition,
  type RunExecutor,
} from "../agents";
import { createRepositoryWorkspaceProvisioner, type RepositoryCheckoutSource } from "../inputs/repository";
import { createAppleContainerSandboxProvider } from "../providers/apple-container-sandbox";
import { createOpenAIAgentsRuntime } from "../providers/openai-agents-runtime";
import { softwareEngineerRole } from "../roles/software-engineer";
import {
  createAppleContainerClient,
  type AppleContainerClient,
} from "../sdk/src";
import type { OpenAICompatibleModel } from "../runtime/openai-agents";

const defaultLimits = {
  maxDurationMs: 30 * 60 * 1000,
  maxOutputBytes: 1024 * 1024,
};

export function createSoftwareEngineerExecutor(options: {
  model: OpenAICompatibleModel;
  image?: string;
  repositorySources?: readonly RepositoryCheckoutSource[];
  container?: AppleContainerClient;
  createId?: () => string;
}): RunExecutor {
  const container = options.container ?? createAppleContainerClient();
  const definition: AgentDefinition = {
    id: softwareEngineerRole.id,
    instructions: softwareEngineerRole.instructions,
    requestedCapabilities: softwareEngineerRole.requestedCapabilities,
    runtime: {
      image: options.image ?? Bun.env.SWEAT_AGENT_IMAGE ?? "sweat-agent:latest",
      model: options.model,
    },
    executionPolicy: defaultLimits,
  };
  return createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: createAppleContainerSandboxProvider({
      container,
      createId: options.createId,
    }),
    runtime: createOpenAIAgentsRuntime({}),
    inputs: options.repositorySources
    ? createRepositoryWorkspaceProvisioner({ sources: options.repositorySources })
      : undefined,
  });
}
