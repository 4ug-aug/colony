export interface SandboxSpec {
  image: string;
  volumes?: readonly string[];
}

export interface ExecRequest {
  command: readonly string[];
  env?: Record<string, string | undefined>;
  workdir?: string;
  onOutput?: (chunk: {
    stream: "stdout" | "stderr";
    text: string;
  }) => void;
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
