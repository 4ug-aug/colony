import { createServer } from "node:net";

export interface SandboxSpec {
  image: string;
  volumes?: readonly string[];
  publish?: { guestPort: number };
}

export type OutputChunk = { stream: "stdout" | "stderr"; text: string };

export interface ExecRequest {
  command: readonly string[];
  env?: Record<string, string | undefined>;
  workdir?: string;
  onOutput?: (chunk: OutputChunk) => void;
  /** Retain this command's output on the Machine console. */
  log?: "init" | "preview";
}

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface Sandbox {
  readonly id: string;
  /**
   * Host URL forwarding to `spec.publish.guestPort`. Present only when the
   * sandbox was created with `publish`, so callers narrow on it instead of
   * discovering the missing forward at exec time.
   */
  readonly previewUrl?: string;
  /**
   * Runs to completion and reports `exitCode`. A non-zero exit is a result,
   * not a throw — only the sandbox itself failing rejects.
   */
  exec(request: ExecRequest): Promise<ExecutionResult>;
  dispose(): Promise<void>;
}

export interface SandboxProvider {
  create(spec: SandboxSpec): Promise<Sandbox>;
}

export type PublishedPort = {
  host: number;
  guest: number;
  url: string;
};

/**
 * Resolves a spec's port publication into the one shape providers need. Keeps
 * "was a port requested" and "which host port did we get" a single narrowable
 * value rather than two loosely-related locals.
 */
export async function publishedPort(
  spec: SandboxSpec,
  allocate: () => Promise<number>,
): Promise<PublishedPort | undefined> {
  if (!spec.publish) return undefined;
  const host = await allocate();
  return { host, guest: spec.publish.guestPort, url: `http://127.0.0.1:${host}` };
}

/** Formats a failed command for an operator, keeping the tail of its output. */
export function commandFailure(
  label: string,
  result: ExecutionResult,
  outputLimit = 2000,
): string {
  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .slice(-outputLimit);
  return `${label} failed with code ${result.exitCode}${output ? `:\n${output}` : ""}`;
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
