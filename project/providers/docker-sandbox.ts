import {
  BunCommandRunner,
  ContainerCommandError,
  type CommandRunner,
} from "../sdk/src";
import type { SandboxProvider } from "../sandboxes";
import { allocateHostPort, publishedPort } from "../sandboxes";
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
    allocatePort?: () => Promise<number>;
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
      const publish = await publishedPort(spec, allocatePort);
      await checked(
        runner,
        [
          "run",
          "--name",
          id,
          "--detach",
          "--add-host",
          "host.container.internal:host-gateway",
          ...(publish
            ? ["--publish", `127.0.0.1:${publish.host}:${publish.guest}`]
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
        hostGateway: "host.container.internal",
        ...(publish ? { previewUrl: publish.url } : {}),

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
          // Unchecked: a non-zero command exit is reported through exitCode.
          const result = await runner.run(args, {
            stdio: "capture",
            ...(request.onOutput ? { onOutput: request.onOutput } : {}),
          });
          return {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          };
        },

        async dispose() {
          disposal ??= checked(runner, ["rm", "--force", id]).then(() => {});
          await disposal;
        },
      };
    },
  };
}
