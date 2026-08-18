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

  expect({ id: sandbox.id, hostGateway: sandbox.hostGateway, result, calls }).toEqual({
    id: "sandbox-1",
    hostGateway: "host.container.internal",
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

test("an Apple container publishes a guest port and exposes its Preview URL", async () => {
  const calls: Array<readonly string[]> = [];
  const runner: CommandRunner = {
    async run(args): Promise<CommandResult> {
      calls.push(args);
      return { args, exitCode: 0, stdout: "", stderr: "" };
    },
  };
  const sandbox = await createAppleContainerSandboxProvider({
    container: createAppleContainerClient(runner),
    createId: () => "sandbox-1",
    allocatePort: async () => 49152,
  }).create({ image: "alpine:latest", publish: { guestPort: 3000 } });

  expect(sandbox.previewUrl).toBe("http://127.0.0.1:49152");
  expect(calls[0]).toContain("--publish");
  expect(calls[0]).toContain("127.0.0.1:49152:3000");
  await sandbox.dispose();
});

test("a non-zero Apple container exec is reported through exitCode, not a throw", async () => {
  const runner: CommandRunner = {
    async run(args): Promise<CommandResult> {
      if (args[0] === "exec") {
        return { args, exitCode: 3, stdout: "out", stderr: "boom" };
      }
      return { args, exitCode: 0, stdout: "", stderr: "" };
    },
  };
  const sandbox = await createAppleContainerSandboxProvider({
    container: createAppleContainerClient(runner),
    createId: () => "sandbox-1",
  }).create({ image: "alpine:latest" });

  expect(sandbox.previewUrl).toBeUndefined();
  expect(await sandbox.exec({ command: ["false"] })).toEqual({
    exitCode: 3,
    stdout: "out",
    stderr: "boom",
  });
});
