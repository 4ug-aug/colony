import { expect, test } from "bun:test";
import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutionResult } from "../sandboxes";
import type { MachineConfig, SmolMachine } from "./smolvm-sandbox";
import {
  createSmolvmMachine,
  createSmolvmSandboxProvider,
  parseDefaultGateway,
  probePreviewUrl,
  resolveSmolvmImage,
  smolvmCreateFlags,
} from "./smolvm-sandbox";
import { allocateHostPort } from "../sandboxes";

const passthroughImage = {
  resolveImage: async (image: string) => image,
};

const succeeds = async (): Promise<ExecutionResult> => ({
  exitCode: 0,
  stdout: "",
  stderr: "",
});

const stubMachine = (overrides: Partial<SmolMachine> = {}): SmolMachine => ({
  exec: succeeds,
  async delete() {},
  ...overrides,
});

type MachineRow = Partial<{
  name: string;
  state: string;
  image: string;
  created_at: number;
  mounts: number;
  network: boolean;
}>;

/** Stands in for the smolvm CLI, which owns the machine list the console shows. */
const cli = (...rows: MachineRow[]) => ({
  run: async (command: readonly string[]): Promise<ExecutionResult> =>
    command[2] === "ls"
      ? { exitCode: 0, stdout: JSON.stringify(rows), stderr: "" }
      : succeeds(),
});

const row = (overrides: MachineRow = {}): MachineRow => ({
  name: "sandbox-1",
  state: "running",
  image: "local:deadbeef",
  created_at: 1_700_000_000,
  mounts: 1,
  network: true,
  ...overrides,
});

const DEFAULT_ROUTE = [
  "Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT",
  "eth0\t00000000\t0102A8C0\t0003\t0\t0\t0\t00000000\t0\t0\t0",
].join("\n");

test("a Linux route table yields the default IPv4 gateway", () => {
  expect(parseDefaultGateway(DEFAULT_ROUTE)).toBe("192.168.2.1");
  expect(
    parseDefaultGateway(
      "Iface Destination Gateway Flags\neth0 0101A8C0 00000000 0001\n",
    ),
  ).toBeUndefined();
});

test("a smolvm machine behaves as a sandbox", async () => {
  const configs: MachineConfig[] = [];
  const execs: Array<Parameters<SmolMachine["exec"]>> = [];
  const chunks: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
  let deletes = 0;
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    ...passthroughImage,
    createMachine: async (config) => {
      configs.push(config);
      return stubMachine({
        async exec(command, options) {
          execs.push([command, options]);
          if (command[0] === "cat") {
            return { exitCode: 0, stdout: DEFAULT_ROUTE, stderr: "" };
          }
          options?.onOutput?.({ stream: "stdout", text: "hello\n" });
          options?.onOutput?.({ stream: "stderr", text: "warning\n" });
          return { exitCode: 0, stdout: "hello\n", stderr: "warning\n" };
        },
        async delete() {
          deletes += 1;
        },
      });
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
  expect(sandbox.hostGateway).toBe("192.168.2.1");
  expect(configs).toEqual([
    {
      name: "sandbox-1",
      image: "alpine:latest",
      network: true,
      mounts: [{ source: "/tmp/work", target: "/work", readOnly: false }],
    },
  ]);
  expect(execs).toHaveLength(2);
  expect(execs[0]?.[0]).toEqual(["cat", "/proc/net/route"]);
  expect(execs[1]?.[0]).toEqual(["echo", "hello"]);
  expect(execs[1]?.[1]).toMatchObject({
    env: { MODEL: "test" },
    workdir: "/work",
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
    ...passthroughImage,
    createMachine: async () =>
      stubMachine({
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

test("the control pane reports CLI state and the Colony image tag", async () => {
  let deletes = 0;
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    ...passthroughImage,
    ...cli(
      row(),
      row({ name: "stray", state: "stopped", created_at: 1_700_000_009 }),
    ),
    createMachine: async () =>
      stubMachine({
        async delete() {
          deletes += 1;
        },
      }),
  });

  await provider.create({
    image: "alpine:latest",
    volumes: ["/tmp/work:/work"],
  });

  expect(await provider.listMachines()).toEqual([
    // Newest first, ahead of the row the CLI happened to list first. A machine
    // this process never created still shows up, and can be nuked.
    expect.objectContaining({
      id: "stray",
      state: "stopped",
      image: "local:deadbeef",
    }),
    expect.objectContaining({
      id: "sandbox-1",
      state: "running",
      image: "alpine:latest",
      createdAt: 1_700_000_000_000,
      mounts: 1,
      network: true,
    }),
  ]);
  expect(await provider.nukeMachine("sandbox-1")).toBe(true);
  expect(deletes).toBe(1);
});

test("nuking a machine this process does not own goes to the CLI", async () => {
  const commands: string[][] = [];
  const provider = createSmolvmSandboxProvider({
    ...passthroughImage,
    run: async (command) => {
      commands.push([...command]);
      return command.includes("ghost")
        ? { exitCode: 1, stdout: "", stderr: "vm not found" }
        : { exitCode: 0, stdout: "", stderr: "" };
    },
  });

  expect(await provider.nukeMachine("stray")).toBe(true);
  expect(await provider.nukeMachine("ghost")).toBe(false);
  expect(commands[0]).toEqual([
    "smolvm",
    "machine",
    "delete",
    "--name",
    "stray",
    "-f",
  ]);
});

test("a failed nuke leaves the machine visible for retry", async () => {
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    ...passthroughImage,
    ...cli(row()),
    createMachine: async () =>
      stubMachine({
        async delete() {
          throw new Error("still running");
        },
      }),
  });
  await provider.create({ image: "alpine:latest" });

  await expect(provider.nukeMachine("sandbox-1")).rejects.toThrow(
    "still running",
  );
  expect(await provider.listMachines()).toEqual([
    expect.objectContaining({ id: "sandbox-1", image: "alpine:latest" }),
  ]);
});

function recordingProvider(execs: string[][]) {
  return createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    allocatePort: async () => 49152,
    ...passthroughImage,
    createMachine: async () =>
      stubMachine({
        async exec(command) {
          execs.push([...command]);
          return { exitCode: 0, stdout: "", stderr: "" };
        },
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
  expect(execs[0]?.[2]).toContain("backend = \"copyfile\"");
  expect(execs[0]?.[2]).toContain("/storage/bun");
  expect(execs[0]?.[2]).toContain("dockerd");
  expect(execs[0]?.[2]).toContain("/storage/docker");
  expect(execs[0]?.[2]).toContain("native.cgroupdriver=cgroupfs");
  expect(execs[0]?.[2]).toContain("did not become ready");
  expect(execs[0]?.[2]).not.toContain("docker.sock");
  expect(execs[1]).toEqual(["cat", "/proc/net/route"]);
});

test("a smolvm machine without a Preview port does not boot dockerd", async () => {
  const execs: string[][] = [];

  await recordingProvider(execs).create({ image: "sweat-agent-cursor:latest" });

  expect(execs).toEqual([["cat", "/proc/net/route"]]);
});

test("a smolvm machine publishes a guest port and exposes its Preview URL", async () => {
  const configs: MachineConfig[] = [];
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    allocatePort: async () => 49152,
    ...passthroughImage,
    createMachine: async (config) => {
      configs.push(config);
      return stubMachine();
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
      return stubMachine();
    },
  });

  await provider.create({ image: "sweat-agent-cursor:latest" });
  expect(configs[0]?.image).toBe("/tmp/colony-smolvm-images/cursor.tar");
});

test("machine settings become smolvm create flags", () => {
  expect(
    smolvmCreateFlags({
      name: "sandbox-1",
      image: "/tmp/cursor.tar",
      network: true,
      mounts: [{ source: "/tmp/work", target: "/work", readOnly: false }],
      ports: [{ host: 49152, guest: 3000 }],
    }),
  ).toEqual(["--net", "-v", "/tmp/work:/work", "-p", "49152:3000"]);
  expect(
    smolvmCreateFlags({ name: "sandbox-1", image: "alpine", network: false }),
  ).toEqual([]);
});

test("Preview is ready only when the host URL answers HTTP", async () => {
  const port = await allocateHostPort();
  const url = `http://127.0.0.1:${port}`;
  expect(await probePreviewUrl(url)).toBe(false);
  const server = Bun.serve({
    port,
    fetch() {
      return new Response("ok");
    },
  });
  try {
    expect(await probePreviewUrl(url)).toBe(true);
  } finally {
    await server.stop(true);
  }
});

const cliConfig: MachineConfig = {
  name: "sandbox-1",
  image: "/tmp/cursor.tar",
  network: true,
};

test("a CLI-backed machine creates, starts, execs and deletes through smolvm", async () => {
  const commands: string[][] = [];
  const machine = await createSmolvmMachine(cliConfig, async (command) => {
    commands.push([...command]);
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  await machine.exec(["bun", "run", "agent"], {
    env: { MODEL: "test" },
    workdir: "/work",
  });
  await machine.delete();

  expect(commands).toEqual([
    [
      "smolvm",
      "machine",
      "create",
      "--name",
      "sandbox-1",
      "--image",
      "/tmp/cursor.tar",
      "--net",
    ],
    ["smolvm", "machine", "start", "--name", "sandbox-1"],
    [
      "smolvm",
      "machine",
      "exec",
      "--stream",
      "--name",
      "sandbox-1",
      "--workdir",
      "/work",
      "--env",
      "MODEL=test",
      "--",
      "bun",
      "run",
      "agent",
    ],
    ["smolvm", "machine", "delete", "--name", "sandbox-1", "-f"],
  ]);
});

test("a machine that fails to start is deleted instead of left behind", async () => {
  const commands: string[][] = [];
  await expect(
    createSmolvmMachine(cliConfig, async (command) => {
      commands.push([...command]);
      return command[2] === "start"
        ? { exitCode: 1, stdout: "", stderr: "no such image" }
        : { exitCode: 0, stdout: "", stderr: "" };
    }),
  ).rejects.toThrow(/no such image/);

  expect(commands.at(-1)).toEqual([
    "smolvm",
    "machine",
    "delete",
    "--name",
    "sandbox-1",
    "-f",
  ]);
});

test("a machine whose smolvm data directory is not empty is force-removed", async () => {
  const leftover = join(
    tmpdir(),
    `colony-smolvm-vms-${crypto.randomUUID()}`,
    "smolvm",
    "vms",
    "8ff950cb92be49cc",
  );
  await mkdir(leftover, { recursive: true });
  await writeFile(join(leftover, "disk.img"), "busy");
  let deletes = 0;
  const machine = await createSmolvmMachine(cliConfig, async (command) => {
    if (command[2] === "delete") {
      deletes += 1;
      if (deletes === 1) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `storage operation failed: delete machine data: ${leftover}: Directory not empty (os error 66)`,
        };
      }
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  await machine.delete();
  expect(deletes).toBe(2);
  expect(await Bun.file(join(leftover, "disk.img")).exists()).toBe(false);
});

test("deleting an already-removed smolvm machine succeeds", async () => {
  const machine = await createSmolvmMachine(cliConfig, async (command) => {
    if (command[2] === "delete") {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Error: vm not found: sandbox-1",
      };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  await machine.delete();
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

test("a smolvm machine retains init and Preview output for the Machine console", async () => {
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    allocatePort: async () => 49152,
    ...passthroughImage,
    probePreview: async () => false,
    ...cli(row()),
    createMachine: async () =>
      stubMachine({
        async exec(command, options) {
          if (command[0] === "cat") {
            return {
              exitCode: 0,
              stdout: "dockerd ready\n",
              stderr: "",
            };
          }
          options?.onOutput?.({ stream: "stdout", text: `${command.at(-1)}\n` });
          return {
            exitCode: 0,
            stdout: `${command.at(-1)}\n`,
            stderr: "",
          };
        },
      }),
  });

  const sandbox = await provider.create({
    image: "alpine:latest",
    publish: { guestPort: 3000 },
  });
  await sandbox.exec({
    command: ["sh", "-lc", "npm install"],
    log: "init",
  });
  await sandbox.exec({
    command: ["sh", "-lc", "make dev"],
    log: "preview",
  });
  await sandbox.exec({ command: ["bun", "run", "agent"] });

  expect(await provider.machineLogs("sandbox-1")).toEqual({
    channels: [
      { name: "preview", text: "make dev\n" },
      { name: "init", text: "npm install\n" },
      { name: "docker", text: "dockerd ready\n" },
    ],
  });
  expect(await provider.machineLogs("missing")).toBeUndefined();
  expect(await provider.listMachines()).toEqual([
    expect.objectContaining({
      id: "sandbox-1",
      previewUrl: "http://127.0.0.1:49152",
      previewReady: false,
      previewError: expect.stringContaining("Preview failed with code 0"),
    }),
  ]);
});

test("a Preview command that exits is reported as a Preview error", async () => {
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    allocatePort: async () => 49152,
    ...passthroughImage,
    probePreview: async () => true,
    ...cli(row()),
    createMachine: async () =>
      stubMachine({
        async exec(command, options) {
          if (command.some((part) => part.includes("make"))) {
            options?.onOutput?.({
              stream: "stderr",
              text: "make: *** [Makefile:31: env] Error 2\n",
            });
            return {
              exitCode: 2,
              stdout: "",
              stderr: "make: *** [Makefile:31: env] Error 2\n",
            };
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      }),
  });
  const sandbox = await provider.create({
    image: "alpine:latest",
    publish: { guestPort: 3000 },
  });
  await sandbox.exec({
    command: ["sh", "-lc", "make dev"],
    log: "preview",
  });
  expect(await provider.listMachines()).toEqual([
    expect.objectContaining({
      previewReady: false,
      previewError: expect.stringContaining("Error 2"),
    }),
  ]);
});

test("a live Preview command is not an error while it is still running", async () => {
  const provider = createSmolvmSandboxProvider({
    createId: () => "sandbox-1",
    allocatePort: async () => 49152,
    ...passthroughImage,
    probePreview: async (url) => url === "http://127.0.0.1:49152",
    ...cli(row()),
    createMachine: async () =>
      stubMachine({
        async exec(command) {
          if (command.some((part) => part.includes("make")))
            return new Promise(() => {});
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      }),
  });
  const sandbox = await provider.create({
    image: "alpine:latest",
    publish: { guestPort: 3000 },
  });
  void sandbox.exec({
    command: ["sh", "-lc", "make dev"],
    log: "preview",
  });
  expect(await provider.listMachines()).toEqual([
    expect.objectContaining({
      previewReady: true,
    }),
  ]);
  expect((await provider.listMachines())[0]?.previewError).toBeUndefined();
});

test("execMachine runs sh -lc in /work", async () => {
  const commands: string[][] = [];
  const provider = createSmolvmSandboxProvider({
    run: async (command) => {
      commands.push([...command]);
      const name = command[command.indexOf("--name") + 1];
      const script = command.at(-1);
      if (name === "ghost")
        return { exitCode: 1, stdout: "", stderr: "vm not found" };
      if (script === "false")
        return { exitCode: 1, stdout: "", stderr: "nope" };
      return { exitCode: 0, stdout: "ok\n", stderr: "" };
    },
  });

  expect(await provider.execMachine("sandbox-1", "ls")).toEqual({
    exitCode: 0,
    stdout: "ok\n",
    stderr: "",
  });
  expect(commands[0]).toEqual([
    "smolvm",
    "machine",
    "exec",
    "--stream",
    "--name",
    "sandbox-1",
    "--workdir",
    "/work",
    "--",
    "sh",
    "-lc",
    "ls",
  ]);
  expect(await provider.execMachine("ghost", "ls")).toBeUndefined();
  expect(await provider.execMachine("sandbox-1", "false")).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "nope",
  });
});
