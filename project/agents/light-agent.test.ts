import { expect, test } from "bun:test";
import {
  createAppleContainerClient,
  type CommandResult,
  type CommandRunner,
} from "../sdk/src";
import { createLightAgentExecutor } from "./light-agent";

test("the light agent runs in an Apple sandbox", async () => {
  const process: CommandRunner = {
    async run(args): Promise<CommandResult> {
      return {
        args,
        exitCode: 0,
        stdout: args[0] === "exec" ? "light-agent: hello\n" : "",
        stderr: "",
      };
    },
  };
  const executor = createLightAgentExecutor({
    container: createAppleContainerClient(process),
    createId: () => "sandbox-1",
  });

  const id = executor.startRun({ agentDefinitionId: "light-agent", task: "hello" });
  while (executor.getRun(id)?.state === "preparing" || executor.getRun(id)?.state === "running") {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const result = executor.getRun(id)!;

  expect(result.stdout).toBe("light-agent: hello\n");
});
