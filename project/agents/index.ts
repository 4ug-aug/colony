import type {
  ExecutionResult,
  Sandbox,
  SandboxProvider,
  SandboxSpec,
} from "../sandboxes";

export interface AgentRequest {
  prompt: string;
  workspace?: string;
}

export interface AgentProvider {
  run(sandbox: Sandbox, request: AgentRequest): Promise<ExecutionResult>;
}

export interface RunAgentRequest extends AgentRequest {
  sandbox: SandboxSpec;
  inputs?: readonly RunInput[];
}

export type RunInput = RepositoryInput;

export interface RepositoryInput {
  type: "repository";
  provider: string;
  repository: string;
  revision: string;
}

export interface PreparedInputs {
  workspace?: { path: string; dispose(): Promise<void> };
}

export interface InputProvisioner {
  prepare(inputs: readonly RunInput[]): Promise<PreparedInputs>;
}

export interface AgentRunner {
  run(request: RunAgentRequest): Promise<ExecutionResult>;
}

export function createAgentRunner(dependencies: {
  sandboxes: SandboxProvider;
  agent: AgentProvider;
  inputs?: InputProvisioner;
}): AgentRunner {
  return {
    async run(request) {
      const inputs = await dependencies.inputs?.prepare(request.inputs ?? []);
      try {
        const sandbox = await dependencies.sandboxes.create({
          ...request.sandbox,
          volumes: inputs?.workspace
            ? [...(request.sandbox.volumes ?? []), `${inputs.workspace.path}:/work`]
            : request.sandbox.volumes,
        });
        try {
          return await dependencies.agent.run(sandbox, {
            prompt: request.prompt,
            workspace: inputs?.workspace ? "/work" : undefined,
          });
        } finally {
          await sandbox.dispose();
        }
      } finally {
        await inputs?.workspace?.dispose();
      }
    },
  };
}
