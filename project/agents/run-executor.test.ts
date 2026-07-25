import { expect, test } from "bun:test";
import {
  createInMemoryAgentDefinitionResolver,
  createRunExecutor,
  type AgentDefinition,
} from "./index";

const definition: AgentDefinition = {
  id: "test-agent",
  instructions: "test instructions",
  requestedCapabilities: [],
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
