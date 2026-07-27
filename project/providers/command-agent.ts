import type { AgentProvider, RuntimeRequest } from "../agents";

export function createCommandAgentProvider(options: {
  command(request: RuntimeRequest): readonly string[];
}): AgentProvider {
  return {
    run: (sandbox, request) =>
      sandbox.exec({
        command: options.command(request),
        ...(request.onOutput ? { onOutput: request.onOutput } : {}),
      }),
  };
}
