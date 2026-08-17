import { createServer } from "node:net";

export interface SandboxSpec {
  image: string;
  volumes?: readonly string[];
  publish?: { guestPort: number };
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

export interface PreviewProcess {
  readonly url: string;
  exited: Promise<ExecutionResult>;
}

export interface Sandbox {
  readonly id: string;
  exec(request: ExecRequest): Promise<ExecutionResult>;
  startPreview(
    command: string,
    options?: { workdir?: string },
  ): Promise<PreviewProcess>;
  dispose(): Promise<void>;
}

export interface SandboxProvider {
  create(spec: SandboxSpec): Promise<Sandbox>;
}

export function allocateHostPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a host port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    server.on("error", reject);
  });
}

export function previewUrl(hostPort: number): string {
  return `http://127.0.0.1:${hostPort}`;
}
