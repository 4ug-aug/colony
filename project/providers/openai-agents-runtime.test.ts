import { expect, test } from "bun:test";
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
        executionPolicy: { maxDurationMs: 1000, maxOutputBytes: 1000 },
      },
      workspace: "/work",
    },
  );

  expect(request).toEqual({
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
});
