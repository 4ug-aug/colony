import { expect, test } from "bun:test";
import { serializeStep, type Step } from "../agents";
import { createOpenAIAgentsRuntime } from "./openai-agents-runtime";

test("the OpenAI runtime passes the definition and task to its container command", async () => {
  let request: unknown;
  const runtime = createOpenAIAgentsRuntime();

  await runtime.run(
    {
      id: "sandbox-1",
      exec: async (value) => {
        request = value;
        return { exitCode: 0, stdout: "done", stderr: "" };
      },
      dispose: async () => {},
    },
    {
      task: "Fix the test",
      definition: {
        id: "software-engineer",
        instructions: "Inspect and verify.",
        requestedCapabilities: [],
        runtime: {
          image: "sweat-agent:latest",
          model: { baseUrl: "https://models.example/v1", apiKey: "secret", model: "test" },
        },
        executionPolicy: { maxDurationMs: 1000, maxOutputBytes: 1000, maxSteps: 100 },
      },
      workspace: "/work",
    },
  );

  const { onOutput: _onOutput, ...rest } = request as Record<string, unknown>;
  expect(rest).toEqual({
    command: ["bun", "run", "/app/runtime/cli.ts"],
    env: {
      SWEAT_AGENT_TASK: "Fix the test",
      SWEAT_AGENT_ID: "software-engineer",
      SWEAT_AGENT_INSTRUCTIONS: "Inspect and verify.",
      SWEAT_MODEL_BASE_URL: "https://models.example/v1",
      SWEAT_MODEL_API_KEY: "secret",
      SWEAT_MODEL_NAME: "test",
    },
    workdir: "/work",
  });
  expect(typeof _onOutput).toBe("function");
});

// Shared minimal definition used by step-parsing tests.
const minimalDefinition = {
  id: "agent-x",
  instructions: "Do stuff.",
  requestedCapabilities: [] as const,
  runtime: {
    image: "sweat-agent:latest",
    model: { baseUrl: "https://models.example/v1", apiKey: "key", model: "m" },
  },
  executionPolicy: { maxDurationMs: 5000, maxOutputBytes: 10000, maxSteps: 100 },
};

// Helper: build a fake sandbox whose exec drives onOutput with given chunks then resolves.
function makeSandbox(chunks: Array<{ stream: "stdout" | "stderr"; text: string }>) {
  return {
    id: "sandbox-test",
    exec: async (req: { onOutput?: (chunk: { stream: "stdout" | "stderr"; text: string }) => void }) => {
      for (const chunk of chunks) req.onOutput?.(chunk);
      return { exitCode: 0, stdout: "raw-ignored", stderr: "err-text" };
    },
    dispose: async () => {},
  };
}

test("stdout step split across two chunks is reassembled into one onStep call", async () => {
  const step: Step = { kind: "message", text: "hello", at: 1000 };
  const line = serializeStep(step);
  // Split the line into two chunks: first without newline, second has the newline.
  const chunks = [
    { stream: "stdout" as const, text: line.slice(0, 5) },
    { stream: "stdout" as const, text: line.slice(5) + "\n" },
  ];

  const received: Step[] = [];
  const runtime = createOpenAIAgentsRuntime();
  await runtime.run(makeSandbox(chunks), {
    task: "t",
    definition: minimalDefinition,
    onStep: (s) => received.push(s),
  });

  expect(received).toHaveLength(1);
  expect(received[0]).toEqual(step);
});

test("two steps in one stdout chunk produce two ordered onStep calls", async () => {
  const step1: Step = { kind: "tool_call", text: "{}", tool: "shell", callId: "c1", at: 1001 };
  const step2: Step = { kind: "tool_result", text: "ok", tool: "shell", callId: "c1", at: 1002 };
  const chunk = serializeStep(step1) + "\n" + serializeStep(step2) + "\n";

  const received: Step[] = [];
  const runtime = createOpenAIAgentsRuntime();
  await runtime.run(makeSandbox([{ stream: "stdout", text: chunk }]), {
    task: "t",
    definition: minimalDefinition,
    onStep: (s) => received.push(s),
  });

  expect(received).toHaveLength(2);
  expect(received[0]).toEqual(step1);
  expect(received[1]).toEqual(step2);
});

test("trailing stdout line without newline is flushed after exec resolves", async () => {
  const step: Step = { kind: "message", text: "trailing", at: 2000 };
  // No trailing newline in this chunk.
  const chunks = [{ stream: "stdout" as const, text: serializeStep(step) }];

  const received: Step[] = [];
  const runtime = createOpenAIAgentsRuntime();
  await runtime.run(makeSandbox(chunks), {
    task: "t",
    definition: minimalDefinition,
    onStep: (s) => received.push(s),
  });

  expect(received).toHaveLength(1);
  expect(received[0]).toEqual(step);
});

test("stdout never reaches onOutput; stderr does; ExecutionResult.stdout is empty", async () => {
  const step: Step = { kind: "message", text: "hi", at: 3000 };
  const chunks = [
    { stream: "stdout" as const, text: serializeStep(step) + "\n" },
    { stream: "stderr" as const, text: "crash log" },
  ];

  const outputChunks: Array<{ stream: string; text: string }> = [];
  const runtime = createOpenAIAgentsRuntime();
  const result = await runtime.run(makeSandbox(chunks), {
    task: "t",
    definition: minimalDefinition,
    onOutput: (chunk) => outputChunks.push(chunk),
  });

  // stdout must not appear in onOutput
  expect(outputChunks.every((c) => c.stream !== "stdout")).toBe(true);
  // stderr must appear
  expect(outputChunks).toContainEqual({ stream: "stderr", text: "crash log" });
  // ExecutionResult.stdout replaced with ""
  expect(result.stdout).toBe("");
  // stderr preserved
  expect(result.stderr).toBe("err-text");
});

test("malformed stdout lines are silently ignored without throwing", async () => {
  const chunks = [
    { stream: "stdout" as const, text: "not-json\n" },
    { stream: "stdout" as const, text: '{"no_kind":true}\n' },
  ];

  const received: Step[] = [];
  const runtime = createOpenAIAgentsRuntime();
  await expect(
    runtime.run(makeSandbox(chunks), {
      task: "t",
      definition: minimalDefinition,
      onStep: (s) => received.push(s),
    }),
  ).resolves.toBeDefined();

  expect(received).toHaveLength(0);
});
