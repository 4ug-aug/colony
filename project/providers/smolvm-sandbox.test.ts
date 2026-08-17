import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import type { ExecEvent, ExecOptions, MachineConfig } from "smolmachines";
import {
  createSmolvmSandboxProvider,
  resolveSmolvmImage,
} from "./smolvm-sandbox";

const passthroughImage = {
  resolveImage: async (image: string) => image,
};

test("a smolvm machine behaves as a sandbox", async () => {
  const configs: MachineConfig[] = [];
  const execs: Array<{ command: string[]; options?: ExecOptions }> = [];
  const chunks: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
  let deletes = 0;
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    ...passthroughImage,
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
  expect(execs).toEqual([
    {
      command: ["echo", "hello"],
      options: { env: { MODEL: "test" }, workdir: "/work" },
    },
  ]);
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
    ...passthroughImage,
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

function recordingProvider(execs: string[][]) {
  return createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    allocatePort: async () => 49152,
    ...passthroughImage,
    createMachine: async () => ({
      async exec(command) {
        execs.push(command);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      async *execStream() {},
      async delete() {},
    }),
  });
}

test("a published smolvm machine starts guest dockerd without a host Docker socket", async () => {
  const execs: string[][] = [];

  await recordingProvider(execs).create({
    image: "sweat-agent-cursor:latest",
    publish: { guestPort: 3000 },
  });

  expect(execs[0]?.[0]).toBe("sh");
  expect(execs[0]?.[2]).toContain("dockerd");
  expect(execs[0]?.[2]).toContain("/storage/docker");
  expect(execs[0]?.[2]).not.toContain("docker.sock");
});

test("a smolvm machine without a Preview port does not boot dockerd", async () => {
  const execs: string[][] = [];

  await recordingProvider(execs).create({ image: "sweat-agent-cursor:latest" });

  expect(execs).toEqual([]);
});

test("a smolvm machine publishes a guest port and exposes its Preview URL", async () => {
  const configs: MachineConfig[] = [];
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    allocatePort: async () => 49152,
    ...passthroughImage,
    createMachine: async (config) => {
      configs.push(config);
      return {
        async exec() {
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

  expect(sandbox.previewUrl).toBe("http://127.0.0.1:49152");
  expect(configs[0]?.ports).toEqual([{ host: 49152, guest: 3000 }]);
  await sandbox.dispose();
});

test("smolvm create boots a local image archive instead of a registry pull", async () => {
  const configs: MachineConfig[] = [];
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    resolveImage: async () => "/tmp/colony-smolvm-images/cursor.tar",
    createMachine: async (config) => {
      configs.push(config);
      return {
        async exec() {
          return { exitCode: 0, stdout: "", stderr: "" };
        },
        async *execStream() {},
        async delete() {},
      };
    },
  });

  await provider.create({ image: "sweat-agent-cursor:latest" });
  expect(configs[0]?.image).toBe("/tmp/colony-smolvm-images/cursor.tar");
});

test("resolveSmolvmImage exports a local Docker tag to a tar archive", async () => {
  const commands: string[][] = [];
  const id = `test${crypto.randomUUID().replaceAll("-", "")}`;
  const image = await resolveSmolvmImage(
    "sweat-agent-cursor:latest",
    async (command) => {
      commands.push([...command]);
      if (command[1] === "image" && command[2] === "inspect") {
        return {
          exitCode: 0,
          stdout: `sha256:${id}\n`,
          stderr: "",
        };
      }
      if (command[1] === "save") {
        const tar = command[command.indexOf("-o") + 1];
        await writeFile(tar, "oci-archive");
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "unused" };
    },
  );
  expect(image).toMatch(new RegExp(`${id}\\.tar$`));
  expect(commands[0]?.slice(0, 3)).toEqual(["docker", "image", "inspect"]);
  expect(commands[1]?.slice(0, 2)).toEqual(["docker", "save"]);
});

test("resolveSmolvmImage refuses a short name that is not a local image", async () => {
  await expect(
    resolveSmolvmImage("sweat-agent-cursor:latest", async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "No such image",
    })),
  ).rejects.toThrow(/Run make agent/);
});

test("resolveSmolvmImage leaves registry references to crane when they are not local", async () => {
  await expect(
    resolveSmolvmImage(
      "ghcr.io/4ug-aug/sweat-v2-agent-cursor:latest",
      async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "No such image",
      }),
    ),
  ).resolves.toBe("ghcr.io/4ug-aug/sweat-v2-agent-cursor:latest");
});

