import { createAgentRunner, type AgentRunner } from "../agents";
import { createAppleContainerSandboxProvider } from "../providers/apple-container-sandbox";
import { createCommandAgentProvider } from "../providers/command-agent";
import {
  createAppleContainerClient,
  type AppleContainerClient,
} from "../sdk/src";

export function createLightAgentRunner(
  options: {
    container?: AppleContainerClient;
    createId?: () => string;
  } = {},
): AgentRunner {
  const container = options.container ?? createAppleContainerClient();

  return createAgentRunner({
    sandboxes: createAppleContainerSandboxProvider({
      container,
      createId: options.createId,
    }),
    agent: createCommandAgentProvider({
      command: ({ prompt }) => [
        "sh",
        "-c",
        'printf "light-agent: %s\\n" "$1"',
        "light-agent",
        prompt,
      ],
    }),
  });
}
