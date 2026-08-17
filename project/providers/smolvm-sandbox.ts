import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type {
  ExecEvent,
  ExecOptions,
  ExecResult,
  MachineConfig,
} from "smolmachines";
import type {
  ExecutionResult,
  OutputChunk,
  SandboxProvider,
} from "../sandboxes";
import { allocateHostPort, publishedPort } from "../sandboxes";

type RunCommand = (command: readonly string[]) => Promise<ExecutionResult>;

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

async function runCommand(command: readonly string[]): Promise<ExecutionResult> {
  try {
    const child = Bun.spawn([...command], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  } catch {
    return { exitCode: 127, stdout: "", stderr: `${command[0]} is not available` };
  }
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

export type SmolMachine = {
  exec(
    command: string[],
    options?: ExecOptions,
  ): Promise<Pick<ExecResult, "exitCode" | "stdout" | "stderr">>;
  execStream(command: string[], options?: ExecOptions): AsyncIterable<ExecEvent>;
  state?(): Promise<string>;
  delete(): Promise<void>;
};

export type SmolvmMachineStatus = {
  id: string;
  state: string;
  image: string;
  createdAt: number;
  mounts: number;
  network: boolean;
  previewUrl?: string;
};

export type SmolvmMachineControl = {
  listMachines(): Promise<SmolvmMachineStatus[]>;
  nukeMachine(id: string): Promise<boolean>;
};

type ManagedMachine = Omit<SmolvmMachineStatus, "state"> & {
  machine: SmolMachine;
  dispose(): Promise<void>;
};

async function createLocalMachine(config: MachineConfig): Promise<SmolMachine> {
  const { Machine } = await import("smolmachines");
  return Machine.create(config, { target: "local" });
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

async function execute(
  machine: SmolMachine,
  command: string[],
  options: ExecOptions | undefined,
  onOutput?: (chunk: OutputChunk) => void,
): Promise<ExecutionResult> {
  if (!onOutput) {
    const result = await machine.exec(command, options);
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  for await (const event of machine.execStream(command, options)) {
    if (event.kind === "stdout" || event.kind === "stderr") {
      onOutput({ stream: event.kind, text: event.data });
      if (event.kind === "stdout") stdout += event.data;
      else stderr += event.data;
    } else if (event.kind === "exit") {
      exitCode = event.exitCode;
    } else if (event.kind === "error") {
      throw new Error(event.message);
    }
  }
  return { exitCode, stdout, stderr };
}

export function createSmolvmSandboxProvider(
  options: {
    createMachine?: (config: MachineConfig) => Promise<SmolMachine>;
    createId?: () => string;
    allocatePort?: () => Promise<number>;
    resolveImage?: (image: string) => Promise<string>;
  } = {},
): SandboxProvider & SmolvmMachineControl {
  const createMachine = options.createMachine ?? createLocalMachine;
  const createId = options.createId ?? (() => `sandbox-${crypto.randomUUID()}`);
  const allocatePort = options.allocatePort ?? allocateHostPort;
  const resolveImage = options.resolveImage ?? resolveSmolvmImage;
  const machines = new Map<string, ManagedMachine>();

  return {
    async listMachines() {
      return Promise.all(
        [...machines.values()].map(async ({ machine, dispose: _, ...entry }) => ({
          ...entry,
          state: machine.state ? await machine.state().catch(() => "unknown") : "running",
        })),
      );
    },

    async nukeMachine(id) {
      const entry = machines.get(id);
      if (!entry) return false;
      await entry.dispose();
      return true;
    },

    async create(spec) {
      const id = createId();
      const publish = await publishedPort(spec, allocatePort);
      const config: MachineConfig = {
        name: id,
        image: await resolveImage(spec.image),
        resources: { network: true },
        ...(spec.volumes ? { mounts: spec.volumes.map(mount) } : {}),
        ...(publish
          ? { ports: [{ host: publish.host, guest: publish.guest }] }
          : {}),
      };
      const machine = await createMachine(config);
      if (publish) await machine.exec(["sh", "-c", guestDockerInit]);
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
      machines.set(id, {
        id,
        image: spec.image,
        createdAt: Date.now(),
        mounts: config.mounts?.length ?? 0,
        network: config.resources?.network ?? false,
        ...(publish ? { previewUrl: publish.url } : {}),
        machine,
        dispose,
      });

      return {
        id,
        ...(publish ? { previewUrl: publish.url } : {}),

        async exec(request) {
          const env = envVars(request.env);
          return execute(
            machine,
            [...request.command],
            {
              ...(env ? { env } : {}),
              ...(request.workdir ? { workdir: request.workdir } : {}),
            },
            request.onOutput,
          );
        },

        async dispose() {
          await dispose();
        },
      };
    },
  };
}
