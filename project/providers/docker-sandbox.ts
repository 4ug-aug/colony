import {
  BunCommandRunner,
  ContainerCommandError,
  type CommandRunner,
} from "../sdk/src";
import type { SandboxProvider } from "../sandboxes";
import { allocateHostPort, previewUrl } from "../sandboxes";
import { isAbsolute } from "node:path";

const idleCommand = ["sh", "-c", "while :; do sleep 3600; done"] as const;
const extraCaCertificate = "/etc/ssl/certs/sweat-extra-ca.pem";

async function checked(
  runner: CommandRunner,
  args: readonly string[],
  options?: Parameters<CommandRunner["run"]>[1],
) {
  const result = await runner.run(args, options);
  if (result.exitCode !== 0) throw new ContainerCommandError(result);
  return result;
}

export function createDockerSandboxProvider(
  options: {
    runner?: CommandRunner;
    createId?: () => string;
    caCertificate?: string;
    allocatePort?: () => Promise<number> | number;
  } = {},
): SandboxProvider {
  if (options.caCertificate && !isAbsolute(options.caCertificate)) {
    throw new Error("Docker agent CA certificate path must be absolute");
  }
  const runner = options.runner ?? new BunCommandRunner("docker");
  const createId = options.createId ?? (() => `sandbox-${crypto.randomUUID()}`);
  const allocatePort = options.allocatePort ?? allocateHostPort;

  return {
    async create(spec) {
      const id = createId();
      const hostPort = spec.publish
        ? await Promise.resolve(allocatePort())
        : undefined;
      await checked(
        runner,
        [
          "run",
          "--name",
          id,
          "--detach",
          "--add-host",
          "host.container.internal:host-gateway",
          ...(hostPort !== undefined && spec.publish
            ? [
                "--publish",
                `127.0.0.1:${hostPort}:${spec.publish.guestPort}`,
              ]
            : []),
          ...(options.caCertificate
            ? ["--volume", `${options.caCertificate}:${extraCaCertificate}:ro`]
            : []),
          ...(spec.volumes?.flatMap((volume) => ["--volume", volume]) ?? []),
          spec.image,
          ...idleCommand,
        ],
        { stdio: "capture" },
      );
      let disposal: Promise<void> | undefined;

      return {
        id,

        async exec(request) {
          const args = ["exec"];
          const env = {
            ...request.env,
            ...(options.caCertificate
              ? { NODE_EXTRA_CA_CERTS: extraCaCertificate }
              : {}),
          };
          for (const [key, value] of Object.entries(env)) {
            args.push("--env", value === undefined ? key : `${key}=${value}`);
          }
          if (request.workdir) args.push("--workdir", request.workdir);
          args.push(id, ...request.command);
          const result = await checked(runner, args, {
            stdio: "capture",
            ...(request.onOutput ? { onOutput: request.onOutput } : {}),
          });
          return {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          };
        },

        async startPreview(command, previewOptions) {
          if (hostPort === undefined) {
            throw new Error(
              "Sandbox was not created with a published guest port",
            );
          }
          const args = ["exec"];
          if (previewOptions?.workdir) {
            args.push("--workdir", previewOptions.workdir);
          }
          args.push(id, "sh", "-lc", command);
          const exited = runner.run(args, { stdio: "capture" }).then((result) => ({
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          }));
          return { url: previewUrl(hostPort), exited };
        },

        async dispose() {
          disposal ??= checked(runner, ["rm", "--force", id]).then(() => {});
          await disposal;
        },
      };
    },
  };
}
