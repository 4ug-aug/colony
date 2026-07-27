import { expect, test } from "bun:test";
import { OpenAIChatCompletionsModel } from "@openai/agents";
import OpenAI from "openai";
import { normalizeModelBaseUrl, runAgent } from "./openai-agents";

function completionStream(
  id: string,
  output:
    | { content: string }
    | { toolCall: { id: string; name: string; arguments: string } },
): Response {
  const deltas = "content" in output
    ? [
        {
          choices: [{
            index: 0,
            delta: { role: "assistant", content: output.content },
            finish_reason: null,
          }],
        },
        {
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        },
      ]
    : [
        {
          choices: [{
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [{
                index: 0,
                id: output.toolCall.id,
                type: "function",
                function: {
                  name: output.toolCall.name,
                  arguments: output.toolCall.arguments,
                },
              }],
            },
            finish_reason: null,
          }],
        },
        {
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        },
      ];
  const events = [
    ...deltas.map((event) => ({
      id,
      object: "chat.completion.chunk",
      created: 0,
      model: "test-model",
      ...event,
    })),
    {
      id,
      object: "chat.completion.chunk",
      created: 0,
      model: "test-model",
      choices: [],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    },
  ];
  return new Response(
    `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );
}

test("OpenAI's root URL uses its versioned API path", () => {
  expect(normalizeModelBaseUrl("https://api.openai.com")).toBe(
    "https://api.openai.com/v1",
  );
});

test("the runtime completes an SDK tool loop against an OpenAI-compatible API", async () => {
  let calls = 0;
  const deltas: string[] = [];
  const client = new OpenAI({
    apiKey: "test-key",
    baseURL: "https://models.example/v1",
    fetch: async () => {
      calls += 1;
      return completionStream(
        `chatcmpl-${calls}`,
        calls === 1
          ? {
              toolCall: {
                id: "call-1",
                name: "shell",
                arguments: '{"command":"printf runtime-ready"}',
              },
            }
          : { content: "runtime ready" },
      );
    },
  });

  const result = await runAgent(
    {
      task: "Use the shell tool.",
      instructions: "Use tools when needed.",
      agentId: "software-engineer",
      model: {
        baseUrl: "https://models.example/v1",
        apiKey: "test-key",
        model: "test-model",
      },
    },
    {
      model: new OpenAIChatCompletionsModel(client, "test-model"),
      onTextDelta: (text) => deltas.push(text),
    },
  );
  expect(result).toBe("runtime ready");
  expect(deltas.join("")).toBe("runtime ready");
  expect(calls).toBe(2);
});

test("the runtime allows a coding task to exceed the SDK's ten-turn default", async () => {
  let calls = 0;
  const client = new OpenAI({
    apiKey: "test-key",
    baseURL: "https://models.example/v1",
    fetch: async () => {
      calls += 1;
      return completionStream(
        `chatcmpl-${calls}`,
        calls <= 11
          ? {
              toolCall: {
                id: `call-${calls}`,
                name: "shell",
                arguments: '{"command":"true"}',
              },
            }
          : { content: "coding task complete" },
      );
    },
  });

  await expect(runAgent(
    {
      task: "Use the shell until the task is complete.",
      instructions: "Use tools when needed.",
      agentId: "software-engineer",
      model: { baseUrl: "https://models.example/v1", apiKey: "test-key", model: "test-model" },
    },
    { model: new OpenAIChatCompletionsModel(client, "test-model") },
  )).resolves.toBe("coding task complete");
  expect(calls).toBe(12);
});

test("the runtime fails when its capability server is unreachable", async () => {
  let modelCalls = 0;
  const client = new OpenAI({
    apiKey: "test-key",
    baseURL: "https://models.example/v1",
    fetch: async () => {
      modelCalls += 1;
      return Response.json({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 0,
        model: "test-model",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "should not run" },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    },
  });

  await expect(runAgent(
    {
      task: "Read the issue.",
      instructions: "Use tools when needed.",
      agentId: "software-engineer",
      model: {
        baseUrl: "https://models.example/v1",
        apiKey: "test-key",
        model: "test-model",
      },
      capabilitySession: {
        url: "http://127.0.0.1:1/mcp",
        token: "test-token",
        expiresAt: new Date(Date.now() + 60_000),
        allowedTools: ["get_issue"],
        revoke: () => {},
      },
    },
    { model: new OpenAIChatCompletionsModel(client, "test-model") },
  )).rejects.toThrow();
  expect(modelCalls).toBe(0);
});
