import { expect, test } from "bun:test";
import {
  createAppleContainerClient,
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
} from "../sdk/src";
import { createAppleContainerSandboxProvider } from "./apple-container-sandbox";

test("an Apple container behaves as a sandbox", async () => {
  const calls: Array<{
    args: readonly string[];
    options?: CommandOptions;
  }> = [];
  const runner: CommandRunner = {
    async run(args, options): Promise<CommandResult> {
      calls.push({ args, options });
      return {
        args,
        exitCode: 0,
        stdout: args[0] === "exec" ? "hello\n" : "",
        stderr: "",
      };
    },
  };
  const provider = createAppleContainerSandboxProvider({
    container: createAppleContainerClient(runner),
    createId: () => "sandbox-1",
  });

  const sandbox = await provider.create({ image: "alpine:latest" });
  const result = await sandbox.exec({ command: ["echo", "hello"] });
  await sandbox.dispose();

  expect({ id: sandbox.id, result, calls }).toEqual({
    id: "sandbox-1",
    result: { exitCode: 0, stdout: "hello\n", stderr: "" },
    calls: [
      {
        args: [
          "run",
          "--name",
          "sandbox-1",
          "--detach",
          "alpine:latest",
          "sh",
          "-c",
          "while :; do sleep 3600; done",
        ],
        options: { stdio: "capture" },
      },
      {
        args: ["exec", "sandbox-1", "echo", "hello"],
        options: { stdio: "capture" },
      },
      {
        args: ["delete", "--force", "sandbox-1"],
        options: undefined,
      },
    ],
  });
});

test("disposing a sandbox twice only removes it once", async () => {
  let removals = 0;
  const runner: CommandRunner = {
    async run(args): Promise<CommandResult> {
      if (args[0] === "delete") removals += 1;
      return { args, exitCode: 0, stdout: "", stderr: "" };
    },
  };
  const provider = createAppleContainerSandboxProvider({
    container: createAppleContainerClient(runner),
    createId: () => "sandbox-1",
  });

  const sandbox = await provider.create({ image: "alpine:latest" });
  await sandbox.dispose();
  await sandbox.dispose();

  expect(removals).toBe(1);
});
