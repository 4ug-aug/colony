import { expect, test } from "bun:test";
import {
  boundStepText,
  CURSOR_STEP_TEXT_LIMIT,
  cursorCredentialStillInEnv,
  mapCursorEventToSteps,
  runCursorAgent,
  takeCursorApiKeyFromEnv,
  type CursorAgentFactory,
  type CursorSdkMessage,
} from "./cursor-sdk";

test("takeCursorApiKeyFromEnv clears SWEAT_CURSOR_API_KEY and CURSOR_API_KEY", () => {
  const env: Record<string, string | undefined> = {
    SWEAT_CURSOR_API_KEY: "secret-from-sweat",
    CURSOR_API_KEY: "should-also-clear",
    PATH: "/usr/bin",
  };
  expect(takeCursorApiKeyFromEnv(env)).toBe("secret-from-sweat");
  expect(env.SWEAT_CURSOR_API_KEY).toBeUndefined();
  expect(env.CURSOR_API_KEY).toBeUndefined();
  expect(env.PATH).toBe("/usr/bin");
  expect(cursorCredentialStillInEnv(env)).toBe(false);
});

test("mapCursorEventToSteps maps assistant text and ignores thinking", () => {
  const assistant: CursorSdkMessage = {
    type: "assistant",
    message: {
      content: [
        { type: "text", text: "Hello" },
        { type: "tool_use", id: "x", name: "shell", input: {} },
      ],
    },
  };
  const thinking: CursorSdkMessage = {
    type: "thinking",
    text: "secret chain of thought",
  };
  expect(mapCursorEventToSteps(assistant)).toEqual([
    expect.objectContaining({ kind: "message", text: "Hello" }),
  ]);
  expect(mapCursorEventToSteps(thinking)).toEqual([]);
});

test("mapCursorEventToSteps pairs tool start and completion", () => {
  const start: CursorSdkMessage = {
    type: "tool_call",
    call_id: "c1",
    name: "shell",
    status: "running",
    args: { command: "ls" },
  };
  const done: CursorSdkMessage = {
    type: "tool_call",
    call_id: "c1",
    name: "shell",
    status: "completed",
    result: { stdout: "ok" },
  };
  expect(mapCursorEventToSteps(start)).toEqual([
    expect.objectContaining({
      kind: "tool_call",
      tool: "shell",
      callId: "c1",
      text: JSON.stringify({ command: "ls" }),
    }),
  ]);
  expect(mapCursorEventToSteps(done)).toEqual([
    expect.objectContaining({
      kind: "tool_result",
      tool: "shell",
      callId: "c1",
      text: JSON.stringify({ stdout: "ok" }),
    }),
  ]);
});

test("boundStepText truncates oversized payloads", () => {
  const huge = "x".repeat(CURSOR_STEP_TEXT_LIMIT + 50);
  const text = boundStepText(huge);
  expect(text.length).toBeLessThan(huge.length);
  expect(text.endsWith("…[truncated]")).toBe(true);
});

test("runCursorAgent coalesces streamed assistant deltas into one message step", async () => {
  const steps: Array<{ kind: string; text: string }> = [];
  const createAgent: CursorAgentFactory = async () => ({
    async send() {
      return {
        async *stream() {
          for (const text of [
            "no checkout",
            ", no open",
            " PR, and nothing",
            " to build",
            " or fix",
            " right",
            " now.",
          ]) {
            yield {
              type: "assistant",
              message: { content: [{ type: "text", text }] },
            } satisfies CursorSdkMessage;
          }
        },
        async wait() {
          return {
            status: "finished",
            result:
              "no checkout, no open PR, and nothing to build or fix right now.",
          };
        },
      };
    },
    async [Symbol.asyncDispose]() {},
  });

  await runCursorAgent(
    {
      task: "status",
      instructions: "Be brief.",
      agentId: "software-engineer",
      apiKey: "k",
      model: "composer-2.5",
    },
    { createAgent, onStep: (step) => steps.push(step) },
  );

  expect(steps).toEqual([
    {
      kind: "message",
      text: "no checkout, no open PR, and nothing to build or fix right now.",
      at: expect.any(Number),
    },
  ]);
});

test("runCursorAgent flushes coalesced assistant text before tool calls", async () => {
  const steps: Array<{ kind: string; text: string }> = [];
  const createAgent: CursorAgentFactory = async () => ({
    async send() {
      return {
        async *stream() {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Looking " }] },
          } satisfies CursorSdkMessage;
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "around." }] },
          } satisfies CursorSdkMessage;
          yield {
            type: "tool_call",
            call_id: "c1",
            name: "shell",
            status: "running",
            args: { command: "ls" },
          } satisfies CursorSdkMessage;
          yield {
            type: "tool_call",
            call_id: "c1",
            name: "shell",
            status: "completed",
            result: "ok",
          } satisfies CursorSdkMessage;
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "Done." }] },
          } satisfies CursorSdkMessage;
        },
        async wait() {
          return { status: "finished", result: "Done." };
        },
      };
    },
    async [Symbol.asyncDispose]() {},
  });

  await runCursorAgent(
    {
      task: "t",
      instructions: "i",
      agentId: "a",
      apiKey: "k",
      model: "composer-2.5",
    },
    { createAgent, onStep: (step) => steps.push(step) },
  );

  expect(steps.map((s) => ({ kind: s.kind, text: s.text }))).toEqual([
    { kind: "message", text: "Looking around." },
    { kind: "tool_call", text: JSON.stringify({ command: "ls" }) },
    { kind: "tool_result", text: "ok" },
    { kind: "message", text: "Done." },
  ]);
});

test("runCursorAgent refuses to start if the key is still in process.env", async () => {
  const previous = process.env.SWEAT_CURSOR_API_KEY;
  process.env.SWEAT_CURSOR_API_KEY = "leaked";
  try {
    await expect(
      runCursorAgent(
        {
          task: "t",
          instructions: "i",
          agentId: "a",
          apiKey: "leaked",
          model: "composer-2.5",
        },
        {
          createAgent: async () => {
            throw new Error("should not create");
          },
        },
      ),
    ).rejects.toThrow(/removed from process\.env/);
  } finally {
    if (previous === undefined) delete process.env.SWEAT_CURSOR_API_KEY;
    else process.env.SWEAT_CURSOR_API_KEY = previous;
  }
});

test("trust boundary: shell tool result must not contain the Cursor API key", async () => {
  const apiKey = "cursor-key-must-not-leak";
  const steps: Array<{ kind: string; text: string }> = [];

  // Simulate the required hostile-env check: after bootstrap the shell sees no key.
  const envAfterBootstrap: Record<string, string | undefined> = {
    SWEAT_CURSOR_API_KEY: apiKey,
    PATH: "/usr/bin",
  };
  const taken = takeCursorApiKeyFromEnv(envAfterBootstrap);
  expect(taken).toBe(apiKey);
  expect(cursorCredentialStillInEnv(envAfterBootstrap)).toBe(false);

  const createAgent: CursorAgentFactory = async () => ({
    async send() {
      return {
        async *stream() {
          yield {
            type: "tool_call",
            call_id: "env-1",
            name: "shell",
            status: "running",
            args: { command: "env" },
          } satisfies CursorSdkMessage;
          // Shell inherits process env only — after takeCursorApiKeyFromEnv, no key.
          const shellEnv = Object.entries(envAfterBootstrap)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`)
            .join("\n");
          yield {
            type: "tool_call",
            call_id: "env-1",
            name: "shell",
            status: "completed",
            result: shellEnv,
          } satisfies CursorSdkMessage;
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "ok" }] },
          } satisfies CursorSdkMessage;
        },
        async wait() {
          return { status: "finished", result: "ok" };
        },
      };
    },
    async [Symbol.asyncDispose]() {},
  });

  await runCursorAgent(
    {
      task: "Print env",
      instructions: "Use shell.",
      agentId: "software-engineer",
      apiKey: taken,
      model: "composer-2.5",
    },
    { createAgent, onStep: (step) => steps.push(step) },
  );

  const toolResult = steps.find((s) => s.kind === "tool_result");
  expect(toolResult).toBeDefined();
  expect(toolResult!.text).not.toContain(apiKey);
  expect(toolResult!.text).not.toContain("SWEAT_CURSOR_API_KEY");
  expect(toolResult!.text).not.toContain("CURSOR_API_KEY");
  expect(steps.every((s) => !s.text.includes(apiKey))).toBe(true);
});

test("runCursorAgent passes only inline MCP gateway session", async () => {
  let createOptions: {
    mcpServers?: Record<string, { type: string; url: string; headers: Record<string, string> }>;
    local: { settingSources?: readonly string[] };
  } | undefined;

  const createAgent: CursorAgentFactory = async (options) => {
    createOptions = options;
    return {
      async send() {
        return {
          async *stream() {},
          async wait() {
            return { status: "finished", result: "done" };
          },
        };
      },
      async [Symbol.asyncDispose]() {},
    };
  };

  await runCursorAgent(
    {
      task: "t",
      instructions: "i",
      agentId: "a",
      apiKey: "k",
      model: "composer-2.5",
      capabilitySession: {
        url: "http://host.container.internal:9/mcp",
        token: "mcp-token",
        allowedTools: ["github.create_pull_request"],
      },
    },
    { createAgent },
  );

  expect(createOptions?.local.settingSources).toEqual([]);
  expect(createOptions?.mcpServers).toEqual({
    sweat: {
      type: "http",
      url: "http://host.container.internal:9/mcp",
      headers: { Authorization: "Bearer mcp-token" },
    },
  });
});
