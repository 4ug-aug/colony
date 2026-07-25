import { expect, test } from "bun:test";
import { createCommandAgentProvider } from "./command-agent";

test("a command agent executes its task inside the sandbox", async () => {
  const executed: Array<readonly string[]> = [];
  const agent = createCommandAgentProvider({
    command: ({ task }) => ["light-agent", task],
  });
  const sandbox = {
    id: "sandbox-1",
    exec: async ({ command }: { command: readonly string[] }) => {
      executed.push(command);
      return { exitCode: 0, stdout: "done", stderr: "" };
    },
    dispose: async () => {},
  };

  const result = await agent.run(sandbox, {
    task: "Fix the tests",
    workspace: "/work",
    definition: {
      id: "light-agent",
      instructions: "Run the task.",
      requestedCapabilities: [],
      runtime: { image: "alpine:latest" },
      executionPolicy: { maxDurationMs: 1000, maxOutputBytes: 1000 },
    },
  });

  expect({ executed, result }).toEqual({
    executed: [["light-agent", "Fix the tests"]],
    result: { exitCode: 0, stdout: "done", stderr: "" },
  });
});
