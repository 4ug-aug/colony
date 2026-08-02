import { expect, test } from "bun:test";
import {
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
} from "../sdk/src";
import { createDockerSandboxProvider } from "./docker-sandbox";

test("a Docker container behaves as a sandbox", async () => {
  const calls: Array<{
    args: readonly string[];
    options?: CommandOptions;
  }> = [];
  const chunks: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
  const runner: CommandRunner = {
    async run(args, options): Promise<CommandResult> {
      calls.push({ args, options });
      if (args[0] === "exec") {
        options?.onOutput?.({ stream: "stdout", text: "hello\n" });
        options?.onOutput?.({ stream: "stderr", text: "warning\n" });
      }
      return {
        args,
        exitCode: 0,
        stdout: args[0] === "exec" ? "hello\n" : "",
        stderr: args[0] === "exec" ? "warning\n" : "",
      };
    },
  };
  const provider = createDockerSandboxProvider({
    runner,
    createId: () => "sandbox-1",
  });

  const sandbox = await provider.create({
    image: "alpine:latest",
    volumes: ["/tmp/work:/work"],
  });
  const result = await sandbox.exec({
    command: ["echo", "hello"],
    env: { MODEL: "test", EMPTY: undefined },
    workdir: "/work",
    onOutput: (chunk) => chunks.push(chunk),
  });
  await sandbox.dispose();

  expect({ id: sandbox.id, result, chunks, calls }).toEqual({
    id: "sandbox-1",
    result: {
      exitCode: 0,
      stdout: "hello\n",
      stderr: "warning\n",
    },
    chunks: [
      { stream: "stdout", text: "hello\n" },
      { stream: "stderr", text: "warning\n" },
    ],
    calls: [
      {
        args: [
          "run",
          "--name",
          "sandbox-1",
          "--detach",
          "--add-host",
          "host.container.internal:host-gateway",
          "--volume",
          "/tmp/work:/work",
          "alpine:latest",
          "sh",
          "-c",
          "while :; do sleep 3600; done",
        ],
        options: { stdio: "capture" },
      },
      {
        args: [
          "exec",
          "--env",
          "MODEL=test",
          "--env",
          "EMPTY",
          "--workdir",
          "/work",
          "sandbox-1",
          "echo",
          "hello",
        ],
        options: { stdio: "capture", onOutput: expect.any(Function) },
      },
      {
        args: ["rm", "--force", "sandbox-1"],
        options: undefined,
      },
    ],
  });
});

test("disposing a Docker sandbox twice only removes it once", async () => {
  let removals = 0;
  const runner: CommandRunner = {
    async run(args): Promise<CommandResult> {
      if (args[0] === "rm") removals += 1;
      return { args, exitCode: 0, stdout: "", stderr: "" };
    },
  };
  const provider = createDockerSandboxProvider({
    runner,
    createId: () => "sandbox-1",
  });

  const sandbox = await provider.create({ image: "alpine:latest" });
  await sandbox.dispose();
  await sandbox.dispose();

  expect(removals).toBe(1);
});
