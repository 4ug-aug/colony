import { expect, test } from "bun:test";
import { OpenAIChatCompletionsModel } from "@openai/agents";
import OpenAI from "openai";
import { normalizeModelBaseUrl, runAgent } from "./openai-agents";

test("OpenAI's root URL uses its versioned API path", () => {
  expect(normalizeModelBaseUrl("https://api.openai.com")).toBe(
    "https://api.openai.com/v1",
  );
});

test("the runtime completes an SDK tool loop against an OpenAI-compatible API", async () => {
  let calls = 0;
  const client = new OpenAI({
    apiKey: "test-key",
    baseURL: "https://models.example/v1",
    fetch: async () => {
      calls += 1;
      return Response.json({
        id: `chatcmpl-${calls}`,
        object: "chat.completion",
        created: 0,
        model: "test-model",
        choices:
          calls === 1
            ? [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "call-1",
                        type: "function",
                        function: {
                          name: "shell",
                          arguments: '{"command":"printf runtime-ready"}',
                        },
                      },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ]
            : [
                {
                  index: 0,
                  message: { role: "assistant", content: "runtime ready" },
                  finish_reason: "stop",
                },
              ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
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
    { model: new OpenAIChatCompletionsModel(client, "test-model") },
  );
  expect(result).toBe("runtime ready");
  expect(calls).toBe(2);
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
  )).rejects.toThrow("Was there a typo in the url or port?");
  expect(modelCalls).toBe(0);
});
