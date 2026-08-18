import { expect, test } from "bun:test";
import {
  createRunExecutor,
  type Step,
} from "./index";
import {
  createInMemoryAgentDefinitionResolver,
  type AgentDefinition,
} from "../agents/definition";

const definition: AgentDefinition = {
  id: "test-agent",
  instructions: "test instructions",
  requestedCapabilities: [{ id: "linear.issues", tools: ["linear.get_issue"] }],
  runtime: {
    kind: "openai-agents",
    image: "test:latest",
    model: { baseUrl: "http://example/v1", apiKey: "k", model: "m" },
  },
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

test("startRun registers durably before it schedules execution", () => {
  let sandboxes = 0;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => { sandboxes++; throw new Error("must not run"); } },
    runtime: { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
  });

  expect(() => executor.startRun({
    agentDefinitionId: "test-agent",
    task: "do not start",
    onCreate: () => { throw new Error("SQLite unavailable"); },
  })).toThrow("SQLite unavailable");
  expect(executor.listRuns()).toEqual([]);
  expect(sandboxes).toBe(0);
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

  expect(
    states.filter((state, index) => state !== states[index - 1]),
  ).toEqual(["preparing", "running", "succeeded"]);
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
  expect(executor.getRun(id)?.sandboxId).toBe("sandbox");
  release();
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  expect(executor.getRun(id)?.stdout).toBe("working done");
  expect(executor.getRun(id)?.sandboxId).toBeUndefined();
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

test("stop cancels active runs once and refuses new work", async () => {
  let disposed = 0;
  const releases = new Map<string, () => void>();
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => {
      const id = crypto.randomUUID();
      return {
        id,
        exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        dispose: async () => { disposed++; releases.get(id)?.(); },
      };
    } },
    runtime: { run: async (sandbox) => {
      await new Promise<void>((resolve) => releases.set(sandbox.id, resolve));
      return { exitCode: 0, stdout: "", stderr: "" };
    } },
    createId: (() => { let id = 0; return () => `run-stop-${++id}`; })(),
  });

  const first = executor.startRun({ agentDefinitionId: "test-agent", task: "first" });
  const second = executor.startRun({ agentDefinitionId: "test-agent", task: "second" });
  await waitFor(() => executor.listRuns().every((run) => run.state === "running"));

  await Promise.all([executor.stop(), executor.stop()]);

  expect(executor.getRun(first)?.state).toBe("cancelled");
  expect(executor.getRun(second)?.state).toBe("cancelled");
  expect(disposed).toBe(2);
  expect(() => executor.startRun({ agentDefinitionId: "test-agent", task: "late" }))
    .toThrow("Run executor is stopping");
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
  let runCounter = 0;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => ({ id: "sandbox", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), dispose: async () => {} }) },
    runtime: { run: async (_sandbox, request) => {
      request.onStep?.({ kind: "message", text: "step 1", at: 1 });
      request.onStep?.({ kind: "tool_call", text: "{}", tool: "shell", callId: "c1", at: 2 });
      request.onStep?.({ kind: "tool_result", text: "done", tool: "shell", callId: "c1", at: 3 });
      return { exitCode: 0, stdout: "", stderr: "" };
    } },
    createId: () => `run-steps-${++runCounter}`,
  });

  const unsubscribe = executor.subscribeSteps((runId, step) => steps.push({ runId, step }));
  const id = executor.startRun({ agentDefinitionId: "test-agent", task: "steps" });
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  unsubscribe();

  expect(steps).toHaveLength(3);
  expect(steps[0]).toEqual({ runId: "run-steps-1", step: { kind: "message", text: "step 1", at: 1 } });
  expect(steps[1].step.kind).toBe("tool_call");
  expect(steps[2].step.kind).toBe("tool_result");

  // unsubscribe prevents further delivery on the SAME executor
  const before = steps.length;
  expect(before).toBeGreaterThan(0); // listener was proven live

  const id2 = executor.startRun({ agentDefinitionId: "test-agent", task: "steps-after-unsub" });
  // The runtime for this run is the same factory — it will emit steps, but the listener is gone
  await waitFor(() => executor.getRun(id2)?.state === "succeeded");

  // The unsubscribed listener must not have received anything from the second run
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

test("warm run accepts follow-ups without disposing the provider session", async () => {
  let disposed = 0;
  let sandboxDisposed = 0;
  const turns: string[] = [];
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: {
      create: async () => ({
        id: "sandbox",
        exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        dispose: async () => {
          sandboxDisposed++;
        },
      }),
    },
    runtime: {
      run: async () => {
        throw new Error("one-shot run must not be used for warm");
      },
      openWarmSession: async () => ({
        runTurn: async (task) => {
          turns.push(task);
          return { exitCode: 0, stdout: `ok:${task}`, stderr: "" };
        },
        dispose: async () => {
          disposed++;
        },
      }),
    },
    createId: () => "warm-1",
  });

  const id = executor.startRun({
    agentDefinitionId: "test-agent",
    task: "round-1",
    warm: true,
    idleTtlMs: 60_000,
  });
  await waitFor(() => executor.getRun(id)?.state === "running" && turns.length === 1);
  expect(executor.getRun(id)?.turnActive).toBe(false);
  expect(sandboxDisposed).toBe(0);
  expect(disposed).toBe(0);

  await executor.followUp(id, "round-2");
  expect(turns).toEqual(["round-1", "round-2"]);
  expect(executor.getRun(id)?.state).toBe("running");
  expect(executor.getRun(id)?.turnActive).toBe(false);
  expect(sandboxDisposed).toBe(0);
  expect(disposed).toBe(0);

  await executor.cancelRun(id);
  expect(executor.getRun(id)?.state).toBe("cancelled");
  expect(disposed).toBe(1);
  expect(sandboxDisposed).toBe(1);
});

test("warm run stays turn-active while the provider session opens", async () => {
  let openSession!: () => void;
  const sessionGate = new Promise<void>((resolve) => {
    openSession = resolve;
  });
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: {
      create: async () => ({
        id: "sandbox",
        exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        dispose: async () => {},
      }),
    },
    runtime: {
      run: async () => {
        throw new Error("one-shot run must not be used for warm");
      },
      openWarmSession: async () => {
        await sessionGate;
        return {
          runTurn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
          dispose: async () => {},
        };
      },
    },
    createId: () => "warm-opening",
  });

  const id = executor.startRun({
    agentDefinitionId: "test-agent",
    task: "round-1",
    warm: true,
    idleTtlMs: 60_000,
  });
  await waitFor(() => executor.getRun(id)?.state === "running");
  expect(executor.getRun(id)?.turnActive).toBe(true);

  openSession();
  await waitFor(() => executor.getRun(id)?.turnActive === false);
  await executor.cancelRun(id);
});

test("warm follow-up sets turnActive until runTurn resolves", async () => {
  let resolveTurn!: (value: { exitCode: number; stdout: string; stderr: string }) => void;
  const turnGate = new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
    resolveTurn = resolve;
  });
  let turns = 0;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: {
      create: async () => ({
        id: "sandbox",
        exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        dispose: async () => {},
      }),
    },
    runtime: {
      run: async () => {
        throw new Error("one-shot run must not be used for warm");
      },
      openWarmSession: async () => ({
        runTurn: async () => {
          turns++;
          if (turns === 1) {
            return { exitCode: 0, stdout: "first", stderr: "" };
          }
          return turnGate;
        },
        dispose: async () => {},
      }),
    },
    createId: () => "warm-turn-active",
  });

  const id = executor.startRun({
    agentDefinitionId: "test-agent",
    task: "round-1",
    warm: true,
    idleTtlMs: 60_000,
  });
  await waitFor(() => executor.getRun(id)?.state === "running" && turns === 1);
  expect(executor.getRun(id)?.turnActive).toBe(false);

  const pending = executor.followUp(id, "round-2");
  await waitFor(() => executor.getRun(id)?.turnActive === true);
  resolveTurn({ exitCode: 0, stdout: "second", stderr: "" });
  await pending;
  expect(executor.getRun(id)?.turnActive).toBe(false);
});

test("warm run idle TTL recycles resources", async () => {
  let disposed = 0;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: {
      create: async () => ({
        id: "sandbox",
        exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        dispose: async () => {},
      }),
    },
    runtime: {
      run: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      openWarmSession: async () => ({
        runTurn: async () => ({ exitCode: 0, stdout: "hi", stderr: "" }),
        dispose: async () => {
          disposed++;
        },
      }),
    },
    createId: () => "warm-idle",
  });

  const id = executor.startRun({
    agentDefinitionId: "test-agent",
    task: "start",
    warm: true,
    idleTtlMs: 20,
  });
  await waitFor(() => executor.getRun(id)?.state === "running");
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  expect(disposed).toBe(1);
});

const gitWorkspace = {
  path: "/tmp/work",
  git: {
    repository: "acme/app",
    baseRevision: "main",
    baseCommit: "abc123",
    branch: "sweat/run",
  },
};

test("Git-workspace Preview runs init, starts Preview, and notes the command", async () => {
  const execs: Array<{ command: readonly string[]; log?: string }> = [];
  let runtimeTask: string | undefined;
  let spec: unknown;
  let releasePreview: (() => void) | undefined;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    getPreviewConfig: () => ({
      initCommand: "npm install",
      previewCommand: "make dev",
      guestPort: 3000,
      graceDurationMs: 20,
    }),
    inputs: {
      prepare: async () => ({
        workspace: { ...gitWorkspace, dispose: async () => {} },
      }),
    },
    sandboxes: {
      create: async (value) => {
        spec = value;
        return {
          id: "sandbox",
          previewUrl: "http://127.0.0.1:49152",
          exec: async (request) => {
            execs.push({
              command: request.command,
              ...(request.log ? { log: request.log } : {}),
            });
            if (!request.command.includes("make dev")) {
              return { exitCode: 0, stdout: "", stderr: "" };
            }
            return new Promise((resolve) => {
              releasePreview = () =>
                resolve({ exitCode: 0, stdout: "", stderr: "" });
            });
          },
          dispose: async () => {},
        };
      },
    },
    runtime: {
      run: async (_sandbox, request) => {
        runtimeTask = request.task;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    },
    createId: () => "run-preview",
  });

  const id = executor.startRun({
    agentDefinitionId: "test-agent",
    task: "fix the bug",
  });
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  expect(spec).toEqual({
    image: "test:latest",
    volumes: ["/tmp/work:/work"],
    publish: { guestPort: 3000 },
  });
  expect(execs).toEqual([
    { command: ["sh", "-lc", "npm install"], log: "init" },
    { command: ["sh", "-lc", "make dev"], log: "preview" },
  ]);
  expect(runtimeTask).toBe(
    "fix the bug\n\nA Preview of this workspace was started with: make dev",
  );
  expect(runtimeTask).not.toMatch(/127\.0\.0\.1|49152|:3000/);
  // The stored task stays exactly what the caller asked for.
  expect(executor.getRun(id)?.task).toBe("fix the bug");
  expect(executor.getRun(id)?.preview).toEqual({
    url: "http://127.0.0.1:49152",
    state: "live",
  });
  releasePreview?.();
  await waitFor(() => executor.getRun(id)?.preview?.state === "dead");
});

test("Preview init failure fails the run before the agent starts", async () => {
  let ranAgent = false;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    getPreviewConfig: () => ({
      initCommand: "false",
      previewCommand: "make dev",
      guestPort: 3000,
      graceDurationMs: 0,
    }),
    inputs: {
      prepare: async () => ({
        workspace: { ...gitWorkspace, dispose: async () => {} },
      }),
    },
    sandboxes: {
      create: async () => ({
        id: "sandbox",
        previewUrl: "http://127.0.0.1:49152",
        exec: async (request) => {
          if (request.command.includes("make dev")) {
            throw new Error("must not start Preview");
          }
          return { exitCode: 1, stdout: "", stderr: "missing lockfile" };
        },
        dispose: async () => {},
      }),
    },
    runtime: {
      run: async () => {
        ranAgent = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    },
    createId: () => "run-init-fail",
  });

  const id = executor.startRun({
    agentDefinitionId: "test-agent",
    task: "fix",
  });
  await waitFor(() => executor.getRun(id)?.state === "failed");
  expect(ranAgent).toBe(false);
  expect(executor.getRun(id)?.error).toContain("Preview init failed with code 1");
  // The command's own output reaches the operator, not a wrapped runner error.
  expect(executor.getRun(id)?.error).toContain("missing lockfile");
});

test("stopping drains a Preview grace window instead of leaking the sandbox", async () => {
  let disposed = 0;
  let workspaceDisposed = 0;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    getPreviewConfig: () => ({
      previewCommand: "make dev",
      guestPort: 3000,
      // Far longer than the test: only stop() can bring this down.
      graceDurationMs: 600_000,
    }),
    inputs: {
      prepare: async () => ({
        workspace: {
          ...gitWorkspace,
          dispose: async () => {
            workspaceDisposed++;
          },
        },
      }),
    },
    sandboxes: {
      create: async () => ({
        id: "sandbox",
        previewUrl: "http://127.0.0.1:9",
        exec: async (request) =>
          request.command.includes("make dev")
            ? new Promise<never>(() => {})
            : { exitCode: 0, stdout: "", stderr: "" },
        dispose: async () => {
          disposed++;
        },
      }),
    },
    runtime: { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
    createId: () => "run-stop-grace",
  });

  const id = executor.startRun({ agentDefinitionId: "test-agent", task: "fix" });
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  expect(disposed).toBe(0);
  expect(executor.getRun(id)?.preview?.state).toBe("live");

  await executor.stop();

  expect(disposed).toBe(1);
  expect(workspaceDisposed).toBe(1);
  expect(executor.getRun(id)?.preview?.state).toBe("dead");
});

test("Preview grace delays dispose after success and cancel disposes immediately", async () => {
  let disposed = 0;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    getPreviewConfig: () => ({
      previewCommand: "make dev",
      guestPort: 3000,
      graceDurationMs: 40,
    }),
    inputs: {
      prepare: async () => ({
        workspace: { ...gitWorkspace, dispose: async () => {} },
      }),
    },
    sandboxes: {
      create: async () => ({
        id: "sandbox",
        previewUrl: "http://127.0.0.1:9",
        exec: async (request) =>
          request.command.includes("make dev")
            ? new Promise<never>(() => {})
            : { exitCode: 0, stdout: "", stderr: "" },
        dispose: async () => {
          disposed++;
        },
      }),
    },
    runtime: { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
    createId: () => "run-grace",
  });

  const id = executor.startRun({
    agentDefinitionId: "test-agent",
    task: "fix",
  });
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  expect(disposed).toBe(0);
  await waitFor(() => disposed === 1);

  let cancelledDispose = 0;
  let releaseRuntime!: () => void;
  const runtimeDone = new Promise<void>((resolve) => {
    releaseRuntime = resolve;
  });
  const cancelling = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    getPreviewConfig: () => ({
      previewCommand: "make dev",
      guestPort: 3000,
      graceDurationMs: 60_000,
    }),
    inputs: {
      prepare: async () => ({
        workspace: { ...gitWorkspace, dispose: async () => {} },
      }),
    },
    sandboxes: {
      create: async () => ({
        id: "sandbox",
        previewUrl: "http://127.0.0.1:9",
        exec: async (request) =>
          request.command.includes("make dev")
            ? new Promise<never>(() => {})
            : { exitCode: 0, stdout: "", stderr: "" },
        dispose: async () => {
          cancelledDispose++;
          releaseRuntime();
        },
      }),
    },
    runtime: {
      run: async () => {
        await runtimeDone;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    },
    createId: () => "run-cancel-preview",
  });
  const cancelId = cancelling.startRun({
    agentDefinitionId: "test-agent",
    task: "stop",
  });
  await waitFor(() => cancelling.getRun(cancelId)?.state === "running");
  await cancelling.cancelRun(cancelId);
  await waitFor(() => cancelling.getRun(cancelId)?.state === "cancelled");
  expect(cancelledDispose).toBe(1);
});

test("runs without a Git workspace skip Preview", async () => {
  let spec: unknown;
  const execs: Array<readonly string[]> = [];
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    getPreviewConfig: () => ({
      previewCommand: "make dev",
      guestPort: 3000,
      graceDurationMs: 0,
    }),
    inputs: {
      prepare: async () => ({
        workspace: { path: "/tmp/work", dispose: async () => {} },
      }),
    },
    sandboxes: {
      create: async (value) => {
        spec = value;
        return {
          id: "sandbox",
          exec: async (request) => {
            execs.push(request.command);
            return { exitCode: 0, stdout: "", stderr: "" };
          },
          dispose: async () => {},
        };
      },
    },
    runtime: { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
    createId: () => "run-no-git",
  });
  const id = executor.startRun({
    agentDefinitionId: "test-agent",
    task: "chat",
  });
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  expect(spec).toEqual({
    image: "test:latest",
    volumes: ["/tmp/work:/work"],
  });
  expect(execs).toEqual([]);
  expect(executor.getRun(id)?.preview).toBeUndefined();
  expect(executor.getRun(id)?.preparation).toEqual([
    "Prepared workspace",
    "Created sandbox",
  ]);
  expect(executor.getRun(id)?.waitingOn).toBeUndefined();
});

test("Git-workspace Preview publishes waiting on and preparation", async () => {
  let releasePrepare!: () => void;
  const preparing = new Promise<void>((resolve) => {
    releasePrepare = resolve;
  });
  let releaseSandbox!: () => void;
  const creating = new Promise<void>((resolve) => {
    releaseSandbox = resolve;
  });
  let releaseInit!: () => void;
  const initing = new Promise<void>((resolve) => {
    releaseInit = resolve;
  });
  const seen: Array<{
    waitingOn?: string;
    preparation?: readonly string[];
    state: string;
  }> = [];
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    getPreviewConfig: () => ({
      initCommand: "npm install",
      previewCommand: "make dev",
      guestPort: 3000,
      graceDurationMs: 0,
    }),
    inputs: {
      prepare: async () => {
        await preparing;
        return { workspace: { ...gitWorkspace, dispose: async () => {} } };
      },
    },
    sandboxes: {
      create: async () => {
        await creating;
        return {
          id: "sandbox",
          previewUrl: "http://127.0.0.1:9",
          exec: async (request) => {
            if (request.command.includes("npm install")) {
              await initing;
              return { exitCode: 0, stdout: "", stderr: "" };
            }
            return new Promise<never>(() => {});
          },
          dispose: async () => {},
        };
      },
    },
    runtime: { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
    createId: () => "run-wait",
  });
  executor.subscribe((run) => {
    if (run.id !== "run-wait") return;
    seen.push({
      state: run.state,
      ...(run.waitingOn ? { waitingOn: run.waitingOn } : {}),
      ...(run.preparation ? { preparation: run.preparation } : {}),
    });
  });

  const id = executor.startRun({
    agentDefinitionId: "test-agent",
    task: "fix",
  });
  await waitFor(() => executor.getRun(id)?.waitingOn === "Preparing workspace");
  releasePrepare();
  await waitFor(() => executor.getRun(id)?.waitingOn === "Creating sandbox");
  expect(executor.getRun(id)?.preparation).toEqual(["Prepared workspace"]);
  releaseSandbox();
  await waitFor(
    () => executor.getRun(id)?.waitingOn === "Running init: npm install",
  );
  expect(executor.getRun(id)?.preparation).toEqual([
    "Prepared workspace",
    "Created sandbox",
  ]);
  releaseInit();
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  expect(seen.some((entry) => entry.waitingOn === "Starting preview: make dev")).toBe(
    true,
  );
  expect(executor.getRun(id)?.waitingOn).toBeUndefined();
  expect(executor.getRun(id)?.preparation).toEqual([
    "Prepared workspace",
    "Created sandbox",
    "Ran init: npm install",
    "Started preview: make dev",
  ]);
  expect(seen.some((entry) => entry.waitingOn === "Preparing workspace")).toBe(
    true,
  );
});


test("a Git workspace tells the person its repository, base commit, and branch", async () => {
  let instructions: string | undefined;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    inputs: {
      prepare: async () => ({
        workspace: { ...gitWorkspace, dispose: async () => {} },
      }),
    },
    sandboxes: {
      create: async () => ({
        id: "sandbox",
        exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        dispose: async () => {},
      }),
    },
    runtime: {
      run: async (_sandbox, request) => {
        instructions = request.definition.instructions;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    },
    createId: () => "run-workspace-facts",
  });

  const id = executor.startRun({
    agentDefinitionId: "test-agent",
    task: "fix the bug",
  });
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  expect(instructions).toContain("acme/app");
  expect(instructions).toContain("upstream commit main");
  expect(instructions).toContain("local branch sweat/run");
  expect(instructions).toContain("committed as abc123");
  // The stored definition keeps the role's own instructions.
  expect(executor.getRun(id)?.definition.instructions).not.toContain("acme/app");
});

test("a run without a Git checkout is told nothing about a repository", async () => {
  let instructions: string | undefined;
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    inputs: {
      prepare: async () => ({
        workspace: { path: "/tmp/work", dispose: async () => {} },
      }),
    },
    sandboxes: {
      create: async () => ({
        id: "sandbox",
        exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        dispose: async () => {},
      }),
    },
    runtime: {
      run: async (_sandbox, request) => {
        instructions = request.definition.instructions;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    },
    createId: () => "run-no-checkout",
  });

  const id = executor.startRun({
    agentDefinitionId: "test-agent",
    task: "fix the bug",
  });
  await waitFor(() => executor.getRun(id)?.state === "succeeded");
  expect(instructions).not.toContain("Workspace: the Git repository");
});
