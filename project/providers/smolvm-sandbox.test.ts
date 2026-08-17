import { expect, test } from "bun:test";
import type { ExecEvent, ExecOptions, MachineConfig } from "smolmachines";
import { createSmolvmSandboxProvider } from "./smolvm-sandbox";

test("a smolvm machine behaves as a sandbox", async () => {
  const configs: MachineConfig[] = [];
  const execs: Array<{ command: string[]; options?: ExecOptions }> = [];
  const chunks: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
  let deletes = 0;
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    createMachine: async (config) => {
      configs.push(config);
      return {
        async exec(command, options) {
          execs.push({ command, options });
          return { exitCode: 0, stdout: "", stderr: "" };
        },
        async *execStream(command, options) {
          execs.push({ command, options });
          yield { kind: "stdout", data: "hello\n" } satisfies ExecEvent;
          yield { kind: "stderr", data: "warning\n" } satisfies ExecEvent;
          yield { kind: "exit", exitCode: 0 } satisfies ExecEvent;
        },
        async delete() {
          deletes += 1;
        },
      };
    },
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

  expect(sandbox.id).toBe("sandbox-1");
  expect(configs).toEqual([
    {
      name: "sandbox-1",
      image: "alpine:latest",
      network: true,
      mounts: [
        { source: "/tmp/work", target: "/work", readOnly: false },
      ],
    },
  ]);
  expect(execs[0]).toEqual({
    command: ["sh", "-c", expect.stringContaining("dockerd")],
    options: undefined,
  });
  expect(execs[1]).toEqual({
    command: ["echo", "hello"],
    options: { env: { MODEL: "test" }, workdir: "/work" },
  });
  expect(result).toEqual({
    exitCode: 0,
    stdout: "hello\n",
    stderr: "warning\n",
  });
  expect(chunks).toEqual([
    { stream: "stdout", text: "hello\n" },
    { stream: "stderr", text: "warning\n" },
  ]);
  expect(deletes).toBe(1);
});

test("disposing a smolvm sandbox twice only removes it once", async () => {
  let deletes = 0;
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    createMachine: async () => ({
      async exec() {
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      async *execStream() {},
      async delete() {
        deletes += 1;
      },
    }),
  });

  const sandbox = await provider.create({ image: "alpine:latest" });
  await sandbox.dispose();
  await sandbox.dispose();

  expect(deletes).toBe(1);
});

test("smolvm create starts guest dockerd without a host Docker socket", async () => {
  const execs: string[][] = [];
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    createMachine: async () => ({
      async exec(command) {
        execs.push(command);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      async *execStream() {},
      async delete() {},
    }),
  });

  await provider.create({ image: "sweat-agent-cursor:latest" });

  expect(execs[0]?.[0]).toBe("sh");
  expect(execs[0]?.[2]).toContain("dockerd");
  expect(execs[0]?.[2]).toContain("/storage/docker");
  expect(execs[0]?.[2]).not.toContain("docker.sock");
});

test("a smolvm machine publishes a guest port and starts Preview detached", async () => {
  const configs: MachineConfig[] = [];
  const execs: Array<{ command: string[]; options?: ExecOptions }> = [];
  let releasePreview: (() => void) | undefined;
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    allocatePort: () => 49152,
    createMachine: async (config) => {
      configs.push(config);
      return {
        async exec(command, options) {
          execs.push({ command, options });
          if (command.includes("make dev")) {
            await new Promise<void>((resolve) => {
              releasePreview = resolve;
            });
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        },
        async *execStream() {},
        async delete() {},
      };
    },
  });

  const sandbox = await provider.create({
    image: "alpine:latest",
    publish: { guestPort: 3000 },
  });
  const preview = await sandbox.startPreview("make dev", { workdir: "/work" });
  expect(preview.url).toBe("http://127.0.0.1:49152");
  expect(configs[0]?.ports).toEqual([{ host: 49152, guest: 3000 }]);
  expect(
    execs.some(
      (call) =>
        call.command.includes("make dev") && call.options?.workdir === "/work",
    ),
  ).toBe(true);
  releasePreview?.();
  await expect(preview.exited).resolves.toEqual({
    exitCode: 0,
    stdout: "",
    stderr: "",
  });
  await sandbox.dispose();
});
