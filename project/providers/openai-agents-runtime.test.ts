import { expect, test } from "bun:test";
import { createOpenAIAgentsRuntime } from "./openai-agents-runtime";
import { softwareEngineerRole } from "../roles/software-engineer";

test("the OpenAI runtime passes a role and model to its container command", async () => {
  let request: unknown;
  const runtime = createOpenAIAgentsRuntime({
    role: softwareEngineerRole,
    model: { baseUrl: "https://models.example/v1", apiKey: "secret", model: "test" },
  });

  await runtime.run(
    {
      id: "sandbox-1",
      exec: async (value) => {
        request = value;
        return { exitCode: 0, stdout: "done", stderr: "" };
      },
      dispose: async () => {},
    },
    { prompt: "Fix the test" },
  );

  expect(request).toEqual({
    command: ["bun", "run", "/app/runtime/cli.ts"],
    env: {
      SWEAT_AGENT_PROMPT: "Fix the test",
      SWEAT_AGENT_ROLE: "software-engineer",
      SWEAT_MODEL_BASE_URL: "https://models.example/v1",
      SWEAT_MODEL_API_KEY: "secret",
      SWEAT_MODEL_NAME: "test",
    },
  });
});
