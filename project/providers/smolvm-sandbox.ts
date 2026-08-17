import type { Subprocess } from "bun";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type {
  ExecutionResult,
  OutputChunk,
  SandboxProvider,
} from "../sandboxes";
import { allocateHostPort, commandFailure, publishedPort } from "../sandboxes";

type RunCommand = (
  command: readonly string[],
  onOutput?: (chunk: OutputChunk) => void,
) => Promise<ExecutionResult>;

const localImageDir = join(tmpdir(), "colony-smolvm-images");

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
  "command -v dockerd >/dev/null 2>&1 || exit 0",
  "mkdir -p /storage/docker /var/lib/docker",
  "mount --bind /storage/docker /var/lib/docker || true",
  "rm -f /var/run/docker.pid",
  "nohup dockerd --data-root=/storage/docker --storage-driver=overlay2 >/tmp/dockerd.log 2>&1 &",
  'i=0; while [ "$i" -lt 30 ]; do docker info >/dev/null 2>&1 && exit 0; i=$((i + 1)); sleep 1; done',
  "exit 0",
].join("\n");

export type MachineConfig = {
  name: string;
  image: string;
  network: boolean;
  mounts?: ReadonlyArray<{ source: string; target: string; readOnly: boolean }>;
  ports?: ReadonlyArray<{ host: number; guest: number }>;
};

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
 * Machines are driven through the smolvm CLI rather than the smolmachines SDK:
 * the SDK parses `image` as a registry reference (so a `docker save` archive
 * never boots) and its create/connect block until every published port accepts
 * a connection — which a Preview port only does once the Preview command runs.
 * See docs/adr/0026-smolvm-cli-machine-lifecycle.md.
 */
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
    await run(["smolvm", "machine", "delete", "--name", name, "-f"]);
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
      await smolvm("machine", "delete", "--name", name, "-f");
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
  } = {},
): SandboxProvider {
  const createMachine = options.createMachine ?? createSmolvmMachine;
  const createId = options.createId ?? (() => `sandbox-${crypto.randomUUID()}`);
  const allocatePort = options.allocatePort ?? allocateHostPort;
  const resolveImage = options.resolveImage ?? resolveSmolvmImage;

  return {
    async create(spec) {
      const id = createId();
      const publish = await publishedPort(spec, allocatePort);
      const machine = await createMachine({
        name: id,
        image: await resolveImage(spec.image),
        network: true,
        ...(spec.volumes ? { mounts: spec.volumes.map(mount) } : {}),
        ...(publish
          ? { ports: [{ host: publish.host, guest: publish.guest }] }
          : {}),
      });
      if (publish) await machine.exec(["sh", "-c", guestDockerInit]);
      let disposal: Promise<void> | undefined;

      return {
        id,
        ...(publish ? { previewUrl: publish.url } : {}),

        async exec(request) {
          const env = envVars(request.env);
          return machine.exec(request.command, {
            ...(env ? { env } : {}),
            ...(request.workdir ? { workdir: request.workdir } : {}),
            ...(request.onOutput ? { onOutput: request.onOutput } : {}),
          });
        },

        async dispose() {
          disposal ??= machine.delete();
          await disposal;
        },
      };
    },
  };
}
