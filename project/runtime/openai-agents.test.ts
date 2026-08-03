import { expect, test } from "bun:test";
import {
  OpenAIChatCompletionsModel,
  OpenAIResponsesModel,
  Usage,
  type ModelRequest,
  type ResponseStreamEvent,
} from "@openai/agents";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import type { Step } from "./step";
import {
  CompatibleResponsesModel,
  createModelProvider,
  normalizeModelBaseUrl,
  rewriteVllmMcpCalls,
  runAgent,
  sanitizeOutputStatuses,
  sanitizeUsageDetails,
  stripMcpProtocolInput,
  toolOutputText,
} from "./openai-agents";

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

test("custom providers normalize MLflow Responses extensions", async () => {
  const model = {
    baseUrl: "https://models.example/v1",
    apiKey: "test-key",
    model: "test-model",
  };

  const customModel = await createModelProvider({
    ...model,
    provider: "custom",
  }).getModel();
  expect(customModel).toBeInstanceOf(CompatibleResponsesModel);
  expect(customModel).toBeInstanceOf(OpenAIResponsesModel);
  expect(
    await createModelProvider({ ...model, provider: "openai" }).getModel(),
  ).toBeInstanceOf(OpenAIResponsesModel);

  const usage = new Usage({
    inputTokens: 3,
    outputTokens: 2,
    totalTokens: 5,
    inputTokensDetails: {
      cached_tokens: 1,
      input_tokens_per_turn: [3],
    } as unknown as Record<string, number>,
    outputTokensDetails: {
      reasoning_tokens: 0,
      output_tokens_per_turn: [2],
    } as unknown as Record<string, number>,
    requestUsageEntries: [{
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5,
      inputTokensDetails: {
        cached_tokens: 1,
        cached_tokens_per_turn: [1],
      } as unknown as Record<string, number>,
      outputTokensDetails: {
        reasoning_tokens: 0,
        tool_output_tokens_per_turn: [0],
      } as unknown as Record<string, number>,
    }],
  });
  sanitizeUsageDetails(usage);
  expect(usage.inputTokensDetails).toEqual([{ cached_tokens: 1 }]);
  expect(usage.outputTokensDetails).toEqual([{ reasoning_tokens: 0 }]);
  expect(usage.requestUsageEntries?.[0]?.inputTokensDetails).toEqual({
    cached_tokens: 1,
  });
  expect(usage.requestUsageEntries?.[0]?.outputTokensDetails).toEqual({
    reasoning_tokens: 0,
  });

  const output = [
    { type: "message", status: "complete" },
    { type: "function_call", status: null },
    { type: "hosted_tool_call", status: "failed" },
  ];
  sanitizeOutputStatuses(output);
  expect(output.map((item) => item.status)).toEqual([
    "completed",
    "completed",
    "failed",
  ]);

  const request = (customModel as CompatibleResponsesModel & {
    _buildResponsesCreateRequest(
      request: ModelRequest,
      stream: boolean,
    ): { requestData: { input: Array<{ output?: unknown }> } };
  })._buildResponsesCreateRequest({
    input: [{
      type: "function_call_result",
      name: "workspace.read_messages",
      callId: "call-1",
      status: "completed",
      output: [{ type: "input_text", text: "[augusttollerup] hello" }],
    }],
    modelSettings: {},
    tools: [],
    outputType: "text",
    handoffs: [],
    tracing: false,
  }, true).requestData;
  expect(request.input[0]?.output).toBe("[augusttollerup] hello");
});

test("custom providers rewrite vLLM mcp_call items into function calls", () => {
  const output = [
    {
      type: "hosted_tool_call",
      id: "mcp_1",
      name: "mcp_call",
      status: "completed",
      providerData: {
        type: "mcp_call",
        id: "mcp_1",
        name: "shell",
        arguments: '{"command":"pwd"}',
        server_label: "functions",
      },
    },
    {
      type: "hosted_tool_call",
      id: "mcp_2",
      name: "mcp_list_tools",
      providerData: { type: "mcp_list_tools", server_label: "browser" },
    },
    {
      type: "hosted_tool_call",
      id: "mcp_3",
      name: "mcp_call",
      providerData: {
        type: "mcp_call",
        name: "<|constrain|>json",
        arguments: '{"ok":true}',
      },
    },
  ];
  rewriteVllmMcpCalls(output);
  expect(output).toEqual([
    {
      type: "function_call",
      id: "mcp_1",
      callId: "mcp_1",
      name: "shell",
      arguments: '{"command":"pwd"}',
      status: "completed",
    },
  ]);

  expect(
    stripMcpProtocolInput([
      {
        type: "function_call_result",
        name: "shell",
        callId: "call-1",
        status: "completed",
        output: "ok",
      },
      {
        type: "hosted_tool_call",
        id: "mcp_1",
        name: "mcp_call",
        status: "completed",
        providerData: {
          type: "mcp_call",
          name: "shell",
          arguments: "{}",
        },
      },
    ]),
  ).toEqual([
    {
      type: "function_call_result",
      name: "shell",
      callId: "call-1",
      status: "completed",
      output: "ok",
    },
  ]);
});

test("tool results preserve structured output as JSON", () => {
  expect(toolOutputText({ ok: true, message: { id: "message-1" } })).toBe(
    `{
  "ok": true,
  "message": {
    "id": "message-1"
  }
}`,
  );
});

test("the runtime completes an SDK tool loop against an OpenAI-compatible API", async () => {
  let calls = 0;
  const steps: Step[] = [];
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
      onStep: (step) => steps.push(step),
    },
  );
  expect(result).toBe("runtime ready");
  const messageSteps = steps.filter((s) => s.kind === "message");
  expect(messageSteps.length).toBeGreaterThan(0);
  expect(messageSteps[messageSteps.length - 1]!.text).toBe("runtime ready");
  expect(calls).toBe(2);
});

test("view_image sends a staged image to the model", async () => {
  const root = await mkdtemp(join(tmpdir(), "sweat-view-image-"));
  const outsideRoot = await mkdtemp(join(tmpdir(), "sweat-view-image-outside-"));
  const image = join(root, "attachment-1", "pie.png");
  const outsideImage = join(outsideRoot, "private.png");
  await mkdir(join(root, "attachment-1"));
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  await Promise.all([
    writeFile(image, png),
    writeFile(outsideImage, png),
  ]);
  const client = new OpenAI({
    apiKey: "test-key",
    baseURL: "https://models.example/v1",
  });
  class ImageModel extends OpenAIResponsesModel {
    requests: unknown[] = [];

    override async *getStreamedResponse(
      request: ModelRequest,
    ): AsyncIterable<ResponseStreamEvent> {
      this.requests.push(
        this._buildResponsesCreateRequest(request, true).requestData,
      );
      const output =
        this.requests.length < 3
          ? [{
              type: "function_call" as const,
              callId: `call-view-image-${this.requests.length}`,
              name: "view_image",
              arguments: JSON.stringify({
                path: this.requests.length === 1 ? outsideImage : image,
              }),
              status: "completed" as const,
            }]
          : [{
              type: "message" as const,
              role: "assistant" as const,
              status: "completed" as const,
              content: [{
                type: "output_text" as const,
                text: "I see an apple pie recipe.",
              }],
            }];
      yield {
        type: "response_done",
        response: {
          id: `response-${this.requests.length}`,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          output,
        },
      };
    }
  }
  const model = new ImageModel(client, "test-model");
  const steps: Step[] = [];

  try {
    expect(
      await runAgent(
        {
          task: "What is in the attached image?",
          instructions: "Inspect attached images before answering.",
          agentId: "software-engineer",
          model: {
            baseUrl: "https://models.example/v1",
            apiKey: "test-key",
            model: "test-model",
          },
        },
        {
          model,
          attachmentRoot: root,
          onStep: (step) => steps.push(step),
        },
      ),
    ).toBe("I see an apple pie recipe.");
    expect(JSON.stringify(model.requests[1])).toContain(
      "Image path must be a staged attachment",
    );
    expect(JSON.stringify(model.requests[1])).not.toContain(
      "data:image/png;base64,",
    );
    expect(JSON.stringify(model.requests[2])).toContain(
      "data:image/png;base64,",
    );
    expect(
      steps
        .filter((step) => step.kind === "tool_result")
        .map((step) => step.text),
    ).toEqual([
        "Unable to view image: Image path must be a staged attachment",
        "[image]",
      ]);
  } finally {
    await Promise.all([
      rm(root, { force: true, recursive: true }),
      rm(outsideRoot, { force: true, recursive: true }),
    ]);
  }
});

test("the runtime emits structured steps for a tool call and final message", async () => {
  let calls = 0;
  const steps: Step[] = [];
  // Use a fake API key value that must not appear in emitted step text.
  const fakeApiKey = "sk-test-secret-xyzzy";
  const client = new OpenAI({
    apiKey: fakeApiKey,
    baseURL: "https://models.example/v1",
    fetch: async () => {
      calls += 1;
      return completionStream(
        `chatcmpl-${calls}`,
        calls === 1
          ? {
              toolCall: {
                id: "call-abc",
                name: "shell",
                arguments: '{"command":"echo hello"}',
              },
            }
          : { content: "done" },
      );
    },
  });

  await runAgent(
    {
      task: "Echo hello.",
      instructions: "Use tools when needed.",
      agentId: "software-engineer",
      model: {
        baseUrl: "https://models.example/v1",
        apiKey: fakeApiKey,
        model: "test-model",
      },
    },
    {
      model: new OpenAIChatCompletionsModel(client, "test-model"),
      onStep: (step) => steps.push(step),
    },
  );

  // Must emit: tool_call → tool_result → message (at minimum)
  const toolCallStep = steps.find((s) => s.kind === "tool_call");
  const toolResultStep = steps.find((s) => s.kind === "tool_result");
  const messageStep = steps.find((s) => s.kind === "message" && s.text === "done");

  expect(toolCallStep).toBeDefined();
  expect(toolCallStep?.tool).toBe("shell");
  expect(toolCallStep?.text).toBe('{"command":"echo hello"}');
  expect(typeof toolCallStep?.callId).toBe("string");

  expect(toolResultStep).toBeDefined();
  expect(toolResultStep?.callId).toBe(toolCallStep?.callId);

  expect(messageStep).toBeDefined();

  // No step should contain the fake API key in its text
  for (const step of steps) {
    expect(step.text).not.toContain(fakeApiKey);
  }

  // Steps have monotonically non-decreasing timestamps
  for (let i = 1; i < steps.length; i++) {
    expect(steps[i]!.at).toBeGreaterThanOrEqual(steps[i - 1]!.at);
  }
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
