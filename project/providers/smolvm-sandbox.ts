import type {
  ExecEvent,
  ExecOptions,
  ExecResult,
  MachineConfig,
} from "smolmachines";
import type { ExecutionResult, SandboxProvider } from "../sandboxes";
import { allocateHostPort, previewUrl } from "../sandboxes";

/** Guest dockerd on the VM ext4 disk. Does not expose the socket to the host. */
const guestDockerInit = [
  "command -v dockerd >/dev/null 2>&1 || exit 0",
  "mkdir -p /storage/docker /var/lib/docker",
  "mount --bind /storage/docker /var/lib/docker || true",
  "rm -f /var/run/docker.pid",
  "nohup dockerd --data-root=/storage/docker --storage-driver=overlay2 >/tmp/dockerd.log 2>&1 &",
  'i=0; while [ "$i" -lt 30 ]; do docker info >/dev/null 2>&1 && exit 0; i=$((i + 1)); sleep 1; done',
  "exit 0",
].join("\n");

type SmolMachine = {
  exec(
    command: string[],
    opts?: ExecOptions,
  ): Promise<Pick<ExecResult, "exitCode" | "stdout" | "stderr">>;
  execStream(command: string[], opts?: ExecOptions): AsyncIterable<ExecEvent>;
  delete(): Promise<void>;
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
  opts: ExecOptions | undefined,
  onOutput?: (chunk: { stream: "stdout" | "stderr"; text: string }) => void,
): Promise<ExecutionResult> {
  if (!onOutput) {
    const result = await machine.exec(command, opts);
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  for await (const event of machine.execStream(command, opts)) {
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
    allocatePort?: () => Promise<number> | number;
  } = {},
): SandboxProvider {
  const createMachine = options.createMachine ?? createLocalMachine;
  const createId = options.createId ?? (() => `sandbox-${crypto.randomUUID()}`);
  const allocatePort = options.allocatePort ?? allocateHostPort;

  return {
    async create(spec) {
      const id = createId();
      const hostPort = spec.publish
        ? await Promise.resolve(allocatePort())
        : undefined;
      const machine = await createMachine({
        name: id,
        image: spec.image,
        network: true,
        ...(spec.volumes ? { mounts: spec.volumes.map(mount) } : {}),
        ...(hostPort !== undefined && spec.publish
          ? { ports: [{ host: hostPort, guest: spec.publish.guestPort }] }
          : {}),
      });
      await machine.exec(["sh", "-c", guestDockerInit]);
      let disposal: Promise<void> | undefined;

      return {
        id,

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

        async startPreview(command, previewOptions) {
          if (hostPort === undefined) {
            throw new Error(
              "Sandbox was not created with a published guest port",
            );
          }
          const exited = machine
            .exec(["sh", "-lc", command], {
              ...(previewOptions?.workdir
                ? { workdir: previewOptions.workdir }
                : {}),
            })
            .then((result) => ({
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
            }));
          return { url: previewUrl(hostPort), exited };
        },

        async dispose() {
          disposal ??= machine.delete();
          await disposal;
        },
      };
    },
  };
}
