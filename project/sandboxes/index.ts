export interface SandboxSpec {
  image: string;
}

export interface ExecRequest {
  command: readonly string[];
  env?: Record<string, string | undefined>;
}

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface Sandbox {
  readonly id: string;
  exec(request: ExecRequest): Promise<ExecutionResult>;
  dispose(): Promise<void>;
}

export interface SandboxProvider {
  create(spec: SandboxSpec): Promise<Sandbox>;
}
