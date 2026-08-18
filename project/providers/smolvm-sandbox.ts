import type { Subprocess } from "bun";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type {
  ExecRequest,
  ExecutionResult,
  OutputChunk,
  SandboxProvider,
} from "../sandboxes";
import { allocateHostPort, commandFailure, publishedPort } from "../sandboxes";

type RunCommand = (
  command: readonly string[],
  onOutput?: (chunk: OutputChunk) => void,
) => Promise<ExecutionResult>;

const LOG_TAIL = 32_000;
const localImageDir = join(tmpdir(), "colony-smolvm-images");

function tailLog(text: string): string {
  return text.length <= LOG_TAIL ? text : text.slice(-LOG_TAIL);
}

/** True when the forwarded Preview URL answers HTTP, not merely TCP. */
export async function probePreviewUrl(
  url: string,
  timeoutMs = 750,
): Promise<boolean> {
  try {
    new URL(url);
  } catch {
    return false;
  }
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.status > 0;
  } catch {
    return false;
  }
}

function isLocalImageSource(image: string): boolean {
  return (
    image === "-" ||
    isAbsolute(image) ||
    image.startsWith("./") ||
    image.startsWith("../") ||
    /\.tar(\.gz)?$/.test(image) ||
    image.endsWith(".tgz")
  );
}

/** Short names like `sweat-agent-cursor:latest` are Docker Hub library refs to crane. */
function hasRegistryHost(image: string): boolean {
  const name = image.split("@")[0] ?? image;
  const lastSlash = name.lastIndexOf("/");
  const lastColon = name.lastIndexOf(":");
  const untagged = lastColon > lastSlash ? name.slice(0, lastColon) : name;
  const host = untagged.split("/")[0] ?? "";
  return host.includes(".") || host.includes(":") || host === "localhost";
}

/** Captures a host command's output, streaming it as it arrives when asked. */
async function runCommand(
  command: readonly string[],
  onOutput?: (chunk: OutputChunk) => void,
): Promise<ExecutionResult> {
  let child: Subprocess<"ignore", "pipe", "pipe">;
  try {
    child = Bun.spawn([...command], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    return { exitCode: 127, stdout: "", stderr: `${command[0]} is not available` };
  }
  const read = async (
    stream: ReadableStream<Uint8Array>,
    name: "stdout" | "stderr",
  ): Promise<string> => {
    const decoder = new TextDecoder();
    let text = "";
    for await (const chunk of stream) {
      const part = decoder.decode(chunk, { stream: true });
      text += part;
      onOutput?.({ stream: name, text: part });
    }
    return text;
  };
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    read(child.stdout, "stdout"),
    read(child.stderr, "stderr"),
  ]);
  return { exitCode, stdout, stderr };
}

const imageExporters: ReadonlyArray<{
  inspect: (image: string) => readonly string[];
  save: (image: string, tar: string) => readonly string[];
}> = [
  {
    inspect: (image) => [
      "docker",
      "image",
      "inspect",
      "--format",
      "{{.Id}}",
      image,
    ],
    save: (image, tar) => ["docker", "save", "-o", tar, image],
  },
  {
    inspect: (image) => ["container", "image", "inspect", image],
    save: (image, tar) => ["container", "images", "save", "--output", tar, image],
  },
];

function imageId(stdout: string): string | undefined {
  const line = stdout.trim().split(/\s+/)[0];
  if (!line) return undefined;
  return line.replace(/^sha256:/, "").slice(0, 64);
}

/**
 * smolvm treats a bare tag as a registry pull. Local Colony images are Docker
 * / Apple Container tags, so export a tar when the image is already on the host.
 */
export async function resolveSmolvmImage(
  image: string,
  run: RunCommand = runCommand,
): Promise<string> {
  if (isLocalImageSource(image)) return image;

  for (const exporter of imageExporters) {
    const inspected = await run(exporter.inspect(image));
    if (inspected.exitCode !== 0) continue;
    const id = imageId(inspected.stdout);
    if (!id) continue;
    await mkdir(localImageDir, { recursive: true });
    const tar = join(localImageDir, `${id}.tar`);
    if ((await Bun.file(tar).size) > 0) return tar;
    const saved = await run(exporter.save(image, tar));
    if (saved.exitCode !== 0) {
      throw new Error(
        `Could not export sandbox image ${image}: ${saved.stderr.trim() || saved.stdout.trim()}`,
      );
    }
    if ((await Bun.file(tar).size) === 0) {
      throw new Error(`Could not export sandbox image ${image}: empty archive`);
    }
    return tar;
  }

  if (hasRegistryHost(image)) return image;
  throw new Error(
    `Sandbox image ${image} is not a local Docker or Apple Container image. smolvm will not pull short names from Docker Hub. Run make agent.`,
  );
}

/**
 * Guest dockerd on the VM ext4 disk. Does not expose the socket to the host.
 * Only booted for published sandboxes, whose Preview command may run Compose —
 * a plain agent run should not pay a daemon start plus readiness poll.
 */
const guestDockerInit = [
  // bun's default hardlink/clonefile backends hang on the /work bind mount.
  "if command -v bun >/dev/null 2>&1; then",
  "  mkdir -p /storage/bun",
  "  printf '%s\\n' '[install]' 'backend = \"copyfile\"' 'cache = \"/storage/bun\"' > /root/.bunfig.toml",
  "fi",
  "echo 'precedence :ffff:0:0/96  100' >> /etc/gai.conf",
  "command -v dockerd >/dev/null 2>&1 || exit 0",
  "mkdir -p /storage/docker /var/lib/docker",
  "mount --bind /storage/docker /var/lib/docker || true",
  // Debian docker-ce defaults to systemd; smolvm has no systemd as PID 1.
  "if [ -f /sys/fs/cgroup/cgroup.controllers ]; then",
  "  mkdir -p /sys/fs/cgroup/init",
  "  xargs -rn1 </sys/fs/cgroup/cgroup.procs >/sys/fs/cgroup/init/cgroup.procs 2>/dev/null || true",
  "  sed -e 's/ / +/g' -e 's/^/+/' </sys/fs/cgroup/cgroup.controllers >/sys/fs/cgroup/cgroup.subtree_control 2>/dev/null || true",
  "fi",
  "rm -f /var/run/docker.pid",
  "nohup dockerd --data-root=/storage/docker --storage-driver=overlay2 --exec-opt native.cgroupdriver=cgroupfs >/tmp/dockerd.log 2>&1 &",
  'i=0; while [ "$i" -lt 30 ]; do docker info >/dev/null 2>&1 && exit 0; i=$((i + 1)); sleep 1; done',
  'echo "dockerd did not become ready" >> /tmp/dockerd.log',
  "exit 0",
].join("\n");

export type SmolMachine = {
  exec(
    command: readonly string[],
    options?: {
      env?: Record<string, string>;
      workdir?: string;
      onOutput?: (chunk: OutputChunk) => void;
    },
  ): Promise<ExecutionResult>;
  delete(): Promise<void>;
};

export type MachineConfig = {
  name: string;
  image: string;
  network: boolean;
  mounts?: ReadonlyArray<{ source: string; target: string; readOnly: boolean }>;
  ports?: ReadonlyArray<{ host: number; guest: number }>;
};

/** The fields Colony reads off a `smolvm machine ls --json` row. */
type MachineListEntry = { name: string } & Partial<{
  state: string;
  image: string;
  created_at: number;
  mounts: number;
  network: boolean;
}>;

/** Newest first, then by name: the CLI's own order reshuffles between polls. */
function parseMachineList(stdout: string): MachineListEntry[] {
  try {
    const rows: unknown = JSON.parse(stdout);
    if (!Array.isArray(rows)) return [];
    return (rows as MachineListEntry[])
      .filter((row) => typeof row?.name === "string")
      .sort(
        (left, right) =>
          (right.created_at ?? 0) - (left.created_at ?? 0) ||
          left.name.localeCompare(right.name),
      );
  } catch {
    return [];
  }
}

export type SmolvmMachineStatus = {
  id: string;
  state: string;
  image: string;
  createdAt: number;
  mounts: number;
  network: boolean;
  previewUrl?: string;
  previewReady?: boolean;
  previewError?: string;
};

export type MachineLogChannelName = NonNullable<ExecRequest["log"]> | "docker";

export type MachineLogChannel = {
  name: MachineLogChannelName;
  text: string;
};

export type SmolvmMachineLogs = {
  channels: MachineLogChannel[];
};

export type SmolvmMachineControl = {
  listMachines(): Promise<SmolvmMachineStatus[]>;
  nukeMachine(id: string): Promise<boolean>;
  machineLogs(id: string): Promise<SmolvmMachineLogs | undefined>;
  execMachine(id: string, command: string): Promise<ExecutionResult | undefined>;
};

/** The per-machine facts `smolvm machine ls` cannot report. */
type ManagedMachine = {
  machine: SmolMachine;
  dispose(): Promise<void>;
  /** The Colony tag, which the CLI only knows as a `local:<digest>` archive. */
  image: string;
  previewUrl?: string;
  previewError?: string;
  logs: { init?: string; preview?: string };
};

/** The machine settings smolvm takes as `machine create` flags. */
export function smolvmCreateFlags(config: MachineConfig): string[] {
  return [
    ...(config.network ? ["--net"] : []),
    ...(config.mounts ?? []).flatMap((mount) => [
      "-v",
      `${mount.source}:${mount.target}${mount.readOnly ? ":ro" : ""}`,
    ]),
    ...(config.ports ?? []).flatMap((port) => [
      "-p",
      `${port.host}:${port.guest}`,
    ]),
  ];
}

/**
 * Default IPv4 gateway from a Linux `/proc/net/route` table. Little-endian
 * hex, same layout the kernel writes; virtio-net and TSI both publish one.
 */
export function parseDefaultGateway(table: string): string | undefined {
  for (const line of table.split(/\r?\n/).slice(1)) {
    const columns = line.trim().split(/\s+/);
    const destination = columns[1];
    const gateway = columns[2];
    if (destination !== "00000000" || !gateway || gateway === "00000000") {
      continue;
    }
    const value = Number.parseInt(gateway, 16);
    if (!Number.isFinite(value)) continue;
    return [
      value & 255,
      (value >> 8) & 255,
      (value >> 16) & 255,
      (value >> 24) & 255,
    ].join(".");
  }
  return undefined;
}

async function guestDefaultGateway(
  machine: SmolMachine,
): Promise<string | undefined> {
  try {
    const result = await machine.exec(["cat", "/proc/net/route"]);
    if (result.exitCode !== 0) return undefined;
    return parseDefaultGateway(result.stdout);
  } catch {
    return undefined;
  }
}

/**
 * The SDK parses local archives as registry references and waits for Preview
 * ports before their workload starts, so Colony drives smolvm through its CLI.
 */
function leftoverVmDataDir(text: string): string | undefined {
  const match = text.match(
    /delete machine data: (\/[^\n:]+): Directory not empty/,
  );
  const dir = match?.[1];
  if (!dir?.includes("/smolvm/vms/") || dir.includes("..")) return undefined;
  return dir;
}

function smolvmAlreadyGone(text: string): boolean {
  return /vm not found|no such machine/i.test(text);
}

/** Resolves false when the machine was already gone, true when this call removed it. */
async function deleteSmolvmMachine(
  name: string,
  run: RunCommand,
): Promise<boolean> {
  const args = ["smolvm", "machine", "delete", "--name", name, "-f"] as const;
  const fail = (result: ExecutionResult): never => {
    throw new Error(commandFailure(`smolvm ${args.slice(1).join(" ")}`, result));
  };
  const result = await run(args);
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode === 0) return true;
  if (smolvmAlreadyGone(output)) return false;
  const leftover = leftoverVmDataDir(output);
  if (!leftover) return fail(result);
  await rm(leftover, { recursive: true, force: true });
  const retry = await run(args);
  if (retry.exitCode === 0) return true;
  if (smolvmAlreadyGone(`${retry.stdout}\n${retry.stderr}`)) return false;
  return fail(retry);
}

export async function createSmolvmMachine(
  config: MachineConfig,
  run: RunCommand = runCommand,
): Promise<SmolMachine> {
  const smolvm = async (...args: string[]): Promise<ExecutionResult> => {
    const result = await run(["smolvm", ...args]);
    if (result.exitCode !== 0) {
      throw new Error(commandFailure(`smolvm ${args.join(" ")}`, result));
    }
    return result;
  };
  const { name } = config;

  await smolvm(
    "machine",
    "create",
    "--name",
    name,
    "--image",
    config.image,
    ...smolvmCreateFlags(config),
  );
  try {
    await smolvm("machine", "start", "--name", name);
  } catch (error) {
    await deleteSmolvmMachine(name, run).catch(() => undefined);
    throw error;
  }

  return {
    exec(command, options = {}) {
      return run(
        [
          "smolvm",
          "machine",
          "exec",
          "--stream",
          "--name",
          name,
          ...(options.workdir ? ["--workdir", options.workdir] : []),
          ...Object.entries(options.env ?? {}).flatMap(([key, value]) => [
            "--env",
            `${key}=${value}`,
          ]),
          "--",
          ...command,
        ],
        options.onOutput,
      );
    },
    async delete() {
      await deleteSmolvmMachine(name, run);
    },
  };
}

function envVars(
  env?: Record<string, string | undefined>,
): Record<string, string> | undefined {
  if (!env) return undefined;
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function mount(volume: string) {
  const colon = volume.lastIndexOf(":");
  return {
    source: volume.slice(0, colon),
    target: volume.slice(colon + 1),
    readOnly: false,
  };
}

export function createSmolvmSandboxProvider(
  options: {
    createMachine?: (config: MachineConfig) => Promise<SmolMachine>;
    createId?: () => string;
    allocatePort?: () => Promise<number>;
    resolveImage?: (image: string) => Promise<string>;
    probePreview?: (url: string) => Promise<boolean>;
    run?: RunCommand;
  } = {},
): SandboxProvider & SmolvmMachineControl {
  const createMachine = options.createMachine ?? createSmolvmMachine;
  const createId = options.createId ?? (() => `sandbox-${crypto.randomUUID()}`);
  const allocatePort = options.allocatePort ?? allocateHostPort;
  const resolveImage = options.resolveImage ?? resolveSmolvmImage;
  const probePreview = options.probePreview ?? probePreviewUrl;
  const run = options.run ?? runCommand;
  const machines = new Map<string, ManagedMachine>();

  return {
    /**
     * The CLI is the source of truth, so the console also shows machines this
     * process never created — strays a crashed coordinator left behind.
     */
    async listMachines() {
      const listed = await run(["smolvm", "machine", "ls", "--json"]);
      if (listed.exitCode !== 0) return [];
      return Promise.all(
        parseMachineList(listed.stdout).map(async (entry) => {
          const id = entry.name;
          const managed = machines.get(id);
          return {
            id,
            state: entry.state ?? "unknown",
            image: managed?.image ?? entry.image ?? "",
            createdAt: (entry.created_at ?? 0) * 1000,
            mounts: entry.mounts ?? 0,
            network: entry.network ?? false,
            ...(managed?.previewUrl
              ? {
                  previewUrl: managed.previewUrl,
                  previewReady:
                    !managed.previewError &&
                    (await probePreview(managed.previewUrl)),
                }
              : {}),
            ...(managed?.previewError
              ? { previewError: managed.previewError }
              : {}),
          };
        }),
      );
    },

    async nukeMachine(id) {
      const entry = machines.get(id);
      if (entry) {
        await entry.dispose();
        return true;
      }
      return deleteSmolvmMachine(id, run);
    },

    async machineLogs(id) {
      const entry = machines.get(id);
      if (!entry) return undefined;
      const docker = await entry.machine
        .exec(["cat", "/tmp/dockerd.log"])
        .catch(() => ({ exitCode: 1, stdout: "", stderr: "" }));
      return {
        channels: [
          { name: "preview", text: entry.logs.preview ?? "" },
          { name: "init", text: entry.logs.init ?? "" },
          {
            name: "docker",
            text: docker.exitCode === 0 ? docker.stdout : "",
          },
        ],
      };
    },

    async execMachine(id, command) {
      const result = await run([
        "smolvm",
        "machine",
        "exec",
        "--stream",
        "--name",
        id,
        "--workdir",
        "/work",
        "--",
        "sh",
        "-lc",
        command,
      ]);
      if (smolvmAlreadyGone(`${result.stdout}\n${result.stderr}`))
        return undefined;
      return result;
    },

    async create(spec) {
      const id = createId();
      const publish = await publishedPort(spec, allocatePort);
      const config: MachineConfig = {
        name: id,
        image: await resolveImage(spec.image),
        network: true,
        ...(spec.volumes ? { mounts: spec.volumes.map(mount) } : {}),
        ...(publish
          ? { ports: [{ host: publish.host, guest: publish.guest }] }
          : {}),
      };
      const machine = await createMachine(config);
      if (publish) await machine.exec(["sh", "-c", guestDockerInit]);
      const hostGateway = await guestDefaultGateway(machine);
      let disposal: Promise<void> | undefined;
      const dispose = async () => {
        disposal ??= machine
          .delete()
          .then(() => {
            machines.delete(id);
          })
          .catch((error) => {
            disposal = undefined;
            throw error;
          });
        await disposal;
      };
      const logs: { init?: string; preview?: string } = {};
      const entry: ManagedMachine = {
        machine,
        dispose,
        image: spec.image,
        ...(publish ? { previewUrl: publish.url } : {}),
        logs,
      };
      machines.set(id, entry);

      return {
        id,
        ...(publish ? { previewUrl: publish.url } : {}),
        ...(hostGateway ? { hostGateway } : {}),

        async exec(request) {
          const env = envVars(request.env);
          const channel = request.log;
          let streamed = false;
          const retain = (text: string): void => {
            if (!channel || !text) return;
            logs[channel] = tailLog(`${logs[channel] ?? ""}${text}`);
          };
          const onOutput =
            channel || request.onOutput
              ? (chunk: OutputChunk) => {
                  streamed = true;
                  retain(chunk.text);
                  request.onOutput?.(chunk);
                }
              : undefined;
          const result = await machine.exec(request.command, {
            ...(env ? { env } : {}),
            ...(request.workdir ? { workdir: request.workdir } : {}),
            ...(onOutput ? { onOutput } : {}),
          }).catch((error: unknown) => {
            if (channel === "preview") {
              entry.previewError =
                error instanceof Error ? error.message : "Preview failed";
            }
            throw error;
          });
          // A machine that does not stream still has output worth keeping.
          if (!streamed) retain(`${result.stdout}${result.stderr}`);
          if (channel === "preview") {
            entry.previewError = commandFailure("Preview", {
              exitCode: result.exitCode,
              stdout: logs.preview ?? result.stdout,
              stderr: logs.preview ? "" : result.stderr,
            });
          }
          return result;
        },

        async dispose() {
          await dispose();
        },
      };
    },
  };
}
