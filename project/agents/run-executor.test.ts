import { expect, test } from "bun:test";
import {
  createInMemoryAgentDefinitionResolver,
  createRunExecutor,
  type AgentDefinition,
} from "./index";

const definition: AgentDefinition = {
  id: "test-agent",
  instructions: "test instructions",
  requestedCapabilities: [{ id: "linear.issues", tools: ["linear.get_issue"] }],
  runtime: { image: "test:latest" },
  executionPolicy: { maxDurationMs: 1000, maxOutputBytes: 20 },
};

const waitFor = async (check: () => boolean): Promise<void> => {
  while (!check()) await new Promise((resolve) => setTimeout(resolve, 0));
};

test("startRun records preparation before asynchronous execution and snapshots records", async () => {
  let release!: () => void;
  const preparing = new Promise<void>((resolve) => { release = resolve; });
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    inputs: { prepare: async () => { await preparing; return {}; } },
    sandboxes: { create: async () => ({ id: "sandbox", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), dispose: async () => {} }) },
    runtime: { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
    createId: () => "run-1",
  });

  const id = await executor.startRun({ agentDefinitionId: "test-agent", task: "do it" });
  expect(executor.getRun(id)?.state).toBe("preparing");
  const snapshot = executor.getRun(id)!;
  snapshot.definition.instructions = "mutated";
  expect(executor.getRun(id)?.definition.instructions).toBe("test instructions");
  release();
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
});

test("successful workspace runs retain bounded tails and clean resources", async () => {
  let disposedSandbox = 0;
  let disposedWorkspace = 0;
  let spec: unknown;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    inputs: { prepare: async () => ({ workspace: { path: "/tmp/work", dispose: async () => { disposedWorkspace++; } } }) },
    sandboxes: { create: async (value) => {
      spec = value;
      return { id: "sandbox", exec: async () => ({ exitCode: 0, stdout: "0123456789abcdefghijklmnopqrst", stderr: "stderr" }), dispose: async () => { disposedSandbox++; } };
    } },
    runtime: { run: async (sandbox, request) => {
      expect(sandbox.id).toBe("sandbox");
      expect(request.workspace).toBe("/work");
      return sandbox.exec({ command: ["run"] });
    } },
    createId: () => "run-2",
  });

  const id = await executor.startRun({ agentDefinitionId: "test-agent", task: "do it" });
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  expect(spec).toEqual({ image: "test:latest", volumes: ["/tmp/work:/work"] });
  expect(executor.getRun(id)?.stdout).toBe("[truncated]\nmnopqrst");
  expect(disposedSandbox).toBe(1);
  expect(disposedWorkspace).toBe(1);
});

test("cancellation is idempotent and disposes the sandbox once", async () => {
  let releaseRuntime!: () => void;
  let disposed = 0;
  const runtimeDone = new Promise<void>((resolve) => { releaseRuntime = resolve; });
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => ({
      id: "sandbox",
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      dispose: async () => { disposed++; releaseRuntime(); },
    }) },
    runtime: { run: async () => { await runtimeDone; return { exitCode: 0, stdout: "", stderr: "" }; } },
    createId: () => "run-3",
  });

  const id = await executor.startRun({ agentDefinitionId: "test-agent", task: "stop" });
  await waitFor(() => executor.getRun(id)?.state === "running");
  expect((await executor.cancelRun(id))?.state).toBe("cancelled");
  expect((await executor.cancelRun(id))?.state).toBe("cancelled");
  expect(disposed).toBe(1);
});

test("runtime and cleanup failures become failed runs", async () => {
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => ({
      id: "sandbox",
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      dispose: async () => { throw new Error("cleanup failed"); },
    }) },
    runtime: { run: async () => ({ exitCode: 7, stdout: "out", stderr: "err" }) },
    createId: () => "run-4",
  });

  const id = await executor.startRun({ agentDefinitionId: "test-agent", task: "fail" });
  await waitFor(() => executor.getRun(id)?.state === "failed");
  expect(executor.getRun(id)?.error).toBe("cleanup failed");
});

test("timeout follows the cancellation path", async () => {
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => ({
      id: "sandbox",
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      dispose: async () => {},
    }) },
    runtime: { run: async () => new Promise(() => {}) },
    createId: () => "run-5",
  });

  const id = await executor.startRun({ agentDefinitionId: "test-agent", task: "wait", maxDurationMs: 5 });
  await waitFor(() => executor.getRun(id)?.state === "cancelled");
});

test("limits above the definition maximum are rejected", async () => {
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => { throw new Error("should not run"); } },
    runtime: { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
  });

  expect(() => executor.startRun({
    agentDefinitionId: "test-agent",
    task: "no",
    maxDurationMs: 1001,
  })).toThrow();
});

test("a run grant cannot exceed its agent definition", () => {
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => { throw new Error("should not run"); } },
    runtime: { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
    capabilities: { create: () => ({ url: "http://gateway.test/mcp", token: "token", expiresAt: new Date(), allowedTools: [], revoke: () => {} }) },
  });

  expect(() => executor.startRun({
    agentDefinitionId: "test-agent",
    task: "no",
    capabilityGrant: { tools: ["github.create_pull_request"], expiresAt: new Date(Date.now() + 60_000) },
  })).toThrow("Capability grant exceeds agent definition");
});

test("runs bind a granted capability session and revoke it during cleanup", async () => {
  let revoked = 0;
  let boundToken: string | undefined;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    capabilities: {
      create: (grant) => {
          expect(grant.tools).toEqual(["linear.get_issue"]);
        return {
          url: "http://gateway.test/mcp",
          token: "run-token",
          expiresAt: grant.expiresAt,
          allowedTools: grant.tools,
          revoke: () => { revoked++; },
        };
      },
    },
    sandboxes: { create: async () => ({
      id: "sandbox",
      exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      dispose: async () => {},
    }) },
    runtime: { run: async (_sandbox, request) => {
      boundToken = request.capabilitySession?.token;
      return { exitCode: 0, stdout: "", stderr: "" };
    } },
    createId: () => "run-6",
  });

  const id = executor.startRun({
    agentDefinitionId: "test-agent",
    task: "read issue",
    capabilityGrant: {
      tools: ["linear.get_issue"],
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  expect(boundToken).toBe("run-token");
  expect(revoked).toBe(1);
});
