import type {
  ExecutionResult,
  Sandbox,
  SandboxProvider,
  SandboxSpec,
} from "../sandboxes";

export interface AgentRequest {
  prompt: string;
}

export interface AgentProvider {
  run(sandbox: Sandbox, request: AgentRequest): Promise<ExecutionResult>;
}

export interface RunAgentRequest extends AgentRequest {
  sandbox: SandboxSpec;
}

export interface AgentRunner {
  run(request: RunAgentRequest): Promise<ExecutionResult>;
}

export function createAgentRunner(dependencies: {
  sandboxes: SandboxProvider;
  agent: AgentProvider;
}): AgentRunner {
  return {
    async run(request) {
      const sandbox = await dependencies.sandboxes.create(request.sandbox);
      try {
        return await dependencies.agent.run(sandbox, {
          prompt: request.prompt,
        });
      } finally {
        await sandbox.dispose();
      }
    },
  };
}
