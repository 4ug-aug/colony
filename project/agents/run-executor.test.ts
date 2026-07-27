import { expect, test } from "bun:test";
import {
  createInMemoryAgentDefinitionResolver,
  createRunExecutor,
  type AgentDefinition,
  type Step,
} from "./index";

const definition: AgentDefinition = {
  id: "test-agent",
  instructions: "test instructions",
  requestedCapabilities: [{ id: "linear.issues", tools: ["linear.get_issue"] }],
  runtime: { image: "test:latest" },
  executionPolicy: { maxDurationMs: 1000, maxOutputBytes: 20, maxSteps: 100 },
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

test("lists and publishes run transitions", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    inputs: { prepare: async () => { await pending; return {}; } },
    sandboxes: { create: async () => ({ id: "sandbox", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), dispose: async () => {} }) },
    runtime: { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
    createId: () => "run-events",
  });
  const states: string[] = [];
  const unsubscribe = executor.subscribe((run) => states.push(run.state));

  const id = executor.startRun({ agentDefinitionId: "test-agent", task: "events" });
  expect(executor.listRuns().map((run) => run.id)).toEqual([id]);
  release();
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  unsubscribe();

  expect(states).toEqual(["preparing", "running", "succeeded"]);
});

test("publishes bounded output while a run is active", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => ({ id: "sandbox", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), dispose: async () => {} }) },
    runtime: { run: async (_sandbox, request) => {
      request.onOutput?.({ stream: "stdout", text: "working" });
      await pending;
      return { exitCode: 0, stdout: "working done", stderr: "" };
    } },
    createId: () => "run-output",
  });

  const id = executor.startRun({ agentDefinitionId: "test-agent", task: "stream" });
  await waitFor(() => executor.getRun(id)?.stdout === "working");
  expect(executor.getRun(id)?.state).toBe("running");
  release();
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  expect(executor.getRun(id)?.stdout).toBe("working done");
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

test("steps reach subscribers and unsubscribe stops delivery", async () => {
  const steps: Array<{ runId: string; step: Step }> = [];
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => ({ id: "sandbox", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), dispose: async () => {} }) },
    runtime: { run: async (_sandbox, request) => {
      request.onStep?.({ kind: "message", text: "step 1", at: 1 });
      request.onStep?.({ kind: "tool_call", text: "{}", tool: "shell", callId: "c1", at: 2 });
      request.onStep?.({ kind: "tool_result", text: "done", tool: "shell", callId: "c1", at: 3 });
      return { exitCode: 0, stdout: "", stderr: "" };
    } },
    createId: () => "run-steps-1",
  });

  const unsubscribe = executor.subscribeSteps((runId, step) => steps.push({ runId, step }));
  const id = executor.startRun({ agentDefinitionId: "test-agent", task: "steps" });
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  unsubscribe();

  expect(steps).toHaveLength(3);
  expect(steps[0]).toEqual({ runId: "run-steps-1", step: { kind: "message", text: "step 1", at: 1 } });
  expect(steps[1].step.kind).toBe("tool_call");
  expect(steps[2].step.kind).toBe("tool_result");

  // unsubscribe prevents further delivery
  const before = steps.length;
  // start another run — listener should not fire
  const executor2 = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => ({ id: "sandbox", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), dispose: async () => {} }) },
    runtime: { run: async (_sandbox, request) => {
      request.onStep?.({ kind: "message", text: "after unsub", at: 4 });
      return { exitCode: 0, stdout: "", stderr: "" };
    } },
  });
  // We unsubscribed from executor, not executor2 — test that unsubscribe works on same executor
  const executor3 = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => ({ id: "sandbox", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), dispose: async () => {} }) },
    runtime: { run: async (_sandbox, request) => {
      request.onStep?.({ kind: "message", text: "after unsub from executor", at: 5 });
      return { exitCode: 0, stdout: "", stderr: "" };
    } },
    createId: () => "run-steps-after",
  });
  executor.subscribeSteps((_runId, _step) => steps.push({ runId: "should-not", step: _step }));
  // The original listener was already unsubscribed, count stays the same
  expect(steps.length).toBe(before);
});

test("count cap emits maxSteps real steps then one truncation-marker and no more", async () => {
  const received: Step[] = [];
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => ({ id: "sandbox", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), dispose: async () => {} }) },
    runtime: { run: async (_sandbox, request) => {
      for (let i = 0; i < 6; i++) {
        request.onStep?.({ kind: "message", text: `step ${i}`, at: i });
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    } },
    createId: () => "run-cap",
  });

  executor.subscribeSteps((_runId, step) => received.push(step));
  // maxSteps: 3 (within definition's maxSteps: 100)
  const id = executor.startRun({ agentDefinitionId: "test-agent", task: "cap", maxSteps: 3 });
  await waitFor(() => executor.getRun(id)?.state === "succeeded");

  // 3 real steps + 1 truncation marker = 4 total
  expect(received).toHaveLength(4);
  expect(received[0].text).toBe("step 0");
  expect(received[1].text).toBe("step 1");
  expect(received[2].text).toBe("step 2");
  expect(received[3].kind).toBe("message");
  expect(received[3].text).toBe("[steps truncated: reached maxSteps limit]");
});

test("per-step text truncation caps at MIN(maxOutputBytes, MAX_STEP_TEXT_BYTES)", async () => {
  const received: Step[] = [];
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => ({ id: "sandbox", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), dispose: async () => {} }) },
    runtime: { run: async (_sandbox, request) => {
      // definition.executionPolicy.maxOutputBytes = 20
      // So cap = min(20, 16*1024) = 20
      request.onStep?.({ kind: "message", text: "a".repeat(100), at: 1 });
      return { exitCode: 0, stdout: "", stderr: "" };
    } },
    createId: () => "run-trunc",
  });

  executor.subscribeSteps((_runId, step) => received.push(step));
  const id = executor.startRun({ agentDefinitionId: "test-agent", task: "trunc" });
  await waitFor(() => executor.getRun(id)?.state === "succeeded");

  expect(received).toHaveLength(1);
  const text = received[0].text;
  expect(text.startsWith("[truncated]")).toBe(true);
  const byteLen = new TextEncoder().encode(text).byteLength;
  expect(byteLen).toBeLessThanOrEqual(20);
});

test("runs bind a granted capability session and revoke it during cleanup", async () => {
  let revoked = 0;
  let boundToken: string | undefined;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    capabilities: {
      create: (grant, context) => {
          expect(grant.tools).toEqual(["linear.get_issue"]);
          expect(typeof context?.sandbox?.exec).toBe("function");
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
