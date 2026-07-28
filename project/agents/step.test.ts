import { expect, test } from "bun:test";
import {
  serializeStep,
  parseStep,
  createInMemoryAgentDefinitionResolver,
  createRunExecutor,
  type AgentDefinition,
  type Step,
} from "./index";

// ── serializeStep / parseStep ─────────────────────────────────────────────────

test("serializeStep → parseStep round-trips a message step with newlines and quotes", () => {
  const step: Step = {
    kind: "message",
    text: 'first line\nsecond line\nhas "quotes"',
    at: 1700000000000,
  };
  const line = serializeStep(step);
  // Must be exactly one line — no embedded newlines.
  expect(line.includes("\n")).toBe(false);
  expect(line.split("\n")).toHaveLength(1);
  expect(parseStep(line)).toEqual(step);
});

test("serializeStep → parseStep round-trips a tool_call step with tool and callId", () => {
  const step: Step = {
    kind: "tool_call",
    text: '{"command":"ls -la"}',
    tool: "shell",
    callId: "call-abc-123",
    at: 1700000001000,
  };
  const line = serializeStep(step);
  expect(line.includes("\n")).toBe(false);
  expect(parseStep(line)).toEqual(step);
});

// ── parseStep returns undefined for invalid inputs ────────────────────────────

test("parseStep returns undefined for empty string", () => {
  expect(parseStep("")).toBeUndefined();
});

test("parseStep returns undefined for whitespace-only string", () => {
  expect(parseStep("   ")).toBeUndefined();
});

test("parseStep returns undefined for non-JSON string", () => {
  expect(parseStep("not json")).toBeUndefined();
});

test("parseStep returns undefined when kind is not a valid StepKind", () => {
  expect(parseStep('{"kind":"bogus","text":"x","at":1}')).toBeUndefined();
});

test("parseStep returns undefined when kind is missing", () => {
  expect(parseStep('{"text":"x","at":1}')).toBeUndefined();
});

test("parseStep returns undefined for a bare number", () => {
  expect(parseStep("42")).toBeUndefined();
});

// ── maxSteps validation in startRun ──────────────────────────────────────────

const definition: AgentDefinition = {
  id: "test-agent",
  instructions: "test instructions",
  requestedCapabilities: [],
  runtime: { image: "test:latest" },
  executionPolicy: { maxDurationMs: 5000, maxOutputBytes: 1024 * 1024, maxSteps: 100 },
};

test("startRun throws when requested maxSteps exceeds the definition cap", () => {
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => { throw new Error("should not run"); } },
    runtime: { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
  });

  expect(() => executor.startRun({
    agentDefinitionId: "test-agent",
    task: "no",
    maxSteps: 101,
  })).toThrow("Requested maxSteps must be positive and within the agent definition limit");
});

test("startRun accepts maxSteps at the definition cap and records it in effectiveLimits", async () => {
  let release!: () => void;
  const done = new Promise<void>((resolve) => { release = resolve; });
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => ({ id: "sandbox", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), dispose: async () => {} }) },
    runtime: { run: async () => { release(); return { exitCode: 0, stdout: "", stderr: "" }; } },
    createId: () => "run-steps",
  });

  const id = executor.startRun({ agentDefinitionId: "test-agent", task: "go", maxSteps: 100 });
  await done;
  // Wait for run to finish.
  while (executor.getRun(id)?.state === "preparing" || executor.getRun(id)?.state === "running") {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(executor.getRun(id)?.effectiveLimits.maxSteps).toBe(100);
});

test("startRun accepts maxSteps below the cap and records it in effectiveLimits", async () => {
  let release!: () => void;
  const done = new Promise<void>((resolve) => { release = resolve; });
  const executor = createRunExecutor({
    definitions: createInMemoryAgentDefinitionResolver([definition]),
    sandboxes: { create: async () => ({ id: "sandbox", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), dispose: async () => {} }) },
    runtime: { run: async () => { release(); return { exitCode: 0, stdout: "", stderr: "" }; } },
    createId: () => "run-steps-low",
  });

  const id = executor.startRun({ agentDefinitionId: "test-agent", task: "go", maxSteps: 50 });
  await done;
  while (executor.getRun(id)?.state === "preparing" || executor.getRun(id)?.state === "running") {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(executor.getRun(id)?.effectiveLimits.maxSteps).toBe(50);
});
