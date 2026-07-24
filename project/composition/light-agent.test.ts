import { expect, test } from "bun:test";
import {
  createAppleContainerClient,
  type CommandResult,
  type CommandRunner,
} from "../sdk/src";
import { createLightAgentRunner } from "./light-agent";

test("the light composition runs an agent in an Apple sandbox", async () => {
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
  const runner = createLightAgentRunner({
    container: createAppleContainerClient(process),
    createId: () => "sandbox-1",
  });

  const result = await runner.run({
    sandbox: { image: "alpine:latest" },
    prompt: "hello",
  });

  expect(result.stdout).toBe("light-agent: hello\n");
});
