import { expect, test } from "bun:test";
import { createCommandAgentProvider } from "./command-agent";

test("a command agent executes its prompt inside the sandbox", async () => {
  const executed: Array<readonly string[]> = [];
  const agent = createCommandAgentProvider({
    command: ({ prompt }) => ["light-agent", prompt],
  });
  const sandbox = {
    id: "sandbox-1",
    exec: async ({ command }: { command: readonly string[] }) => {
      executed.push(command);
      return { exitCode: 0, stdout: "done", stderr: "" };
    },
    dispose: async () => {},
  };

  const result = await agent.run(sandbox, { prompt: "Fix the tests" });

  expect({ executed, result }).toEqual({
    executed: [["light-agent", "Fix the tests"]],
    result: { exitCode: 0, stdout: "done", stderr: "" },
  });
});
