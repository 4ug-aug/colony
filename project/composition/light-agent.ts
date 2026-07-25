import {
  createInMemoryAgentDefinitionResolver,
  createRunExecutor,
  type AgentDefinition,
  type RunExecutor,
} from "../agents";
import { createAppleContainerSandboxProvider } from "../providers/apple-container-sandbox";
import { createCommandAgentProvider } from "../providers/command-agent";
import {
  createAppleContainerClient,
  type AppleContainerClient,
} from "../sdk/src";

export const lightAgentDefinition: AgentDefinition = {
  id: "light-agent",
  instructions: "Run the supplied task and report the result.",
  requestedCapabilities: [],
  runtime: { image: "alpine:latest" },
  executionPolicy: { maxDurationMs: 30 * 60 * 1000, maxOutputBytes: 1024 * 1024 },
};

export function createLightAgentExecutor(options: {
  container?: AppleContainerClient;
  createId?: () => string;
} = {}): RunExecutor {
  const container = options.container ?? createAppleContainerClient();
  const runtime = createCommandAgentProvider({
    command: (request) => [
      "sh",
      "-c",
      'printf "light-agent: %s\\n" "$1"',
      "light-agent",
      request.task,
    ],
  });
  return createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([lightAgentDefinition]),
    sandboxes: createAppleContainerSandboxProvider({
      container,
      createId: options.createId,
    }),
    runtime,
  });
}
