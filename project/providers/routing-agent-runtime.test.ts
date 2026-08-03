import { expect, test } from "bun:test";
import type { AgentDefinition } from "../agents/definition";
import { createRoutingAgentRuntime } from "./routing-agent-runtime";

const base = {
  instructions: "x",
  requestedCapabilities: [] as const,
  executionPolicy: {
    maxDurationMs: 1000,
    maxOutputBytes: 1000,
    maxSteps: 100,
  },
};

test("routing runtime selects cursor or openai by definition.runtime.kind", async () => {
  const calls: string[] = [];
  const runtime = createRoutingAgentRuntime({
    cursor: {
      run: async () => {
        calls.push("cursor");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    },
    openai: {
      run: async () => {
        calls.push("openai");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    },
  });
  const sandbox = {
    id: "s",
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    dispose: async () => {},
  };

  await runtime.run(sandbox, {
    task: "t",
    definition: {
      ...base,
      id: "software-engineer",
      runtime: {
        kind: "cursor",
        image: "cursor:latest",
        cursor: { apiKey: "k", model: "m" },
      },
    } satisfies AgentDefinition,
  });
  await runtime.run(sandbox, {
    task: "t",
    definition: {
      ...base,
      id: "antboy",
      runtime: {
        kind: "openai-agents",
        image: "agent:latest",
        model: {
          baseUrl: "https://example/v1",
          apiKey: "k",
          model: "m",
        },
      },
    } satisfies AgentDefinition,
  });

  expect(calls).toEqual(["cursor", "openai"]);
});
