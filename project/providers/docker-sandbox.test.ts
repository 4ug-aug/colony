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
    caCertificate: "/etc/company-ca.pem",
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

  expect({ id: sandbox.id, hostGateway: sandbox.hostGateway, result, chunks, calls }).toEqual({
    id: "sandbox-1",
    hostGateway: "host.container.internal",
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
          "/etc/company-ca.pem:/etc/ssl/certs/sweat-extra-ca.pem:ro",
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
          "--env",
          "NODE_EXTRA_CA_CERTS=/etc/ssl/certs/sweat-extra-ca.pem",
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

test("a Docker agent CA certificate path must be absolute", () => {
  expect(() =>
    createDockerSandboxProvider({ caCertificate: "company-ca.pem" }),
  ).toThrow("Docker agent CA certificate path must be absolute");
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

test("a Docker sandbox publishes a guest port and exposes its Preview URL", async () => {
  const calls: Array<readonly string[]> = [];
  const runner: CommandRunner = {
    async run(args): Promise<CommandResult> {
      calls.push(args);
      return { args, exitCode: 0, stdout: "", stderr: "" };
    },
  };
  const provider = createDockerSandboxProvider({
    runner,
    createId: () => "sandbox-1",
    allocatePort: async () => 49152,
  });

  const sandbox = await provider.create({
    image: "alpine:latest",
    publish: { guestPort: 3000 },
  });

  expect(sandbox.previewUrl).toBe("http://127.0.0.1:49152");
  expect(calls[0]).toContain("--publish");
  expect(calls[0]).toContain("127.0.0.1:49152:3000");
  await sandbox.dispose();
});

test("a Docker sandbox without publish has no Preview URL", async () => {
  const runner: CommandRunner = {
    async run(args): Promise<CommandResult> {
      return { args, exitCode: 0, stdout: "", stderr: "" };
    },
  };
  const sandbox = await createDockerSandboxProvider({
    runner,
    createId: () => "sandbox-1",
  }).create({ image: "alpine:latest" });

  expect(sandbox.previewUrl).toBeUndefined();
});

test("a non-zero Docker exec is reported through exitCode, not a throw", async () => {
  const runner: CommandRunner = {
    async run(args): Promise<CommandResult> {
      if (args[0] === "exec") {
        return { args, exitCode: 3, stdout: "out", stderr: "boom" };
      }
      return { args, exitCode: 0, stdout: "", stderr: "" };
    },
  };
  const sandbox = await createDockerSandboxProvider({
    runner,
    createId: () => "sandbox-1",
  }).create({ image: "alpine:latest" });

  expect(await sandbox.exec({ command: ["false"] })).toEqual({
    exitCode: 3,
    stdout: "out",
    stderr: "boom",
  });
});

test("a Docker sandbox resolves through the configured DNS server", async () => {
  const calls: string[][] = [];
  const runner: CommandRunner = {
    async run(args): Promise<CommandResult> {
      calls.push([...args]);
      return { args, exitCode: 0, stdout: "", stderr: "" };
    },
  };
  const provider = createDockerSandboxProvider({
    runner,
    createId: () => "sandbox-1",
    dns: "10.0.0.53",
  });

  await provider.create({ image: "alpine:latest" });

  const run = calls[0] ?? [];
  expect(run.indexOf("--dns")).toBeGreaterThan(-1);
  expect(run[run.indexOf("--dns") + 1]).toBe("10.0.0.53");
  expect(run.indexOf("--dns")).toBeLessThan(run.indexOf("alpine:latest"));
});
