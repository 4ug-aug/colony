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

test("routing runtime forwards openWarmSession to the selected provider", async () => {
  const calls: string[] = [];
  const runtime = createRoutingAgentRuntime({
    cursor: {
      run: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      openWarmSession: async () => {
        calls.push("cursor-warm");
        return {
          runTurn: async () => ({ exitCode: 0, stdout: "ok", stderr: "" }),
          dispose: async () => {},
        };
      },
    },
    openai: {
      run: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      openWarmSession: async () => {
        calls.push("openai-warm");
        return {
          runTurn: async () => ({ exitCode: 0, stdout: "ok", stderr: "" }),
          dispose: async () => {},
        };
      },
    },
  });
  const sandbox = {
    id: "s",
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    dispose: async () => {},
  };
  const baseRequest = {
    definition: {
      ...base,
      id: "software-engineer",
      runtime: {
        kind: "cursor" as const,
        image: "cursor:latest",
        cursor: { apiKey: "k", model: "m" },
      },
    } satisfies AgentDefinition,
  };

  expect(runtime.openWarmSession).toBeDefined();
  await runtime.openWarmSession!(sandbox, baseRequest);
  await runtime.openWarmSession!(sandbox, {
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

  expect(calls).toEqual(["cursor-warm", "openai-warm"]);
});
