import type { AgentProvider, AgentRequest } from "../agents";

export function createCommandAgentProvider(options: {
  command(request: AgentRequest): readonly string[];
}): AgentProvider {
  return {
    run: (sandbox, request) =>
      sandbox.exec({ command: options.command(request) }),
  };
}
