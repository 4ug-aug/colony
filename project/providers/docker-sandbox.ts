import {
  BunCommandRunner,
  ContainerCommandError,
  type CommandRunner,
} from "../sdk/src";
import type { SandboxProvider } from "../sandboxes";

const idleCommand = ["sh", "-c", "while :; do sleep 3600; done"] as const;

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
  } = {},
): SandboxProvider {
  const runner = options.runner ?? new BunCommandRunner("docker");
  const createId = options.createId ?? (() => `sandbox-${crypto.randomUUID()}`);

  return {
    async create(spec) {
      const id = createId();
      await checked(
        runner,
        [
          "run",
          "--name",
          id,
          "--detach",
          "--add-host",
          "host.container.internal:host-gateway",
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
          for (const [key, value] of Object.entries(request.env ?? {})) {
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

        async dispose() {
          disposal ??= checked(runner, ["rm", "--force", id]).then(() => {});
          await disposal;
        },
      };
    },
  };
}
