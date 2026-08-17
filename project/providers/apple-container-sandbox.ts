import type { SandboxProvider } from "../sandboxes";
import { allocateHostPort, previewUrl } from "../sandboxes";
import type { AppleContainerClient } from "../sdk/src";
import { ContainerCommandError } from "../sdk/src";

export function createAppleContainerSandboxProvider(options: {
  container: AppleContainerClient;
  createId?: () => string;
  allocatePort?: () => Promise<number> | number;
}): SandboxProvider {
  const createId =
    options.createId ?? (() => `sandbox-${crypto.randomUUID()}`);
  const allocatePort = options.allocatePort ?? allocateHostPort;

  return {
    async create(spec) {
      const id = createId();
      const hostPort = spec.publish
        ? await Promise.resolve(allocatePort())
        : undefined;
      await options.container.containers.run(spec.image, {
        name: id,
        detach: true,
        command: ["sh", "-c", "while :; do sleep 3600; done"],
        volumes: spec.volumes,
        ...(hostPort !== undefined && spec.publish
          ? {
              publish: [`127.0.0.1:${hostPort}:${spec.publish.guestPort}`],
            }
          : {}),
      });
      let disposal: Promise<void> | undefined;

      return {
        id,

        async exec(request) {
          const result = await options.container.containers.exec(
            id,
            request.command,
            {
              ...(request.env ? { env: request.env } : {}),
              ...(request.workdir ? { workdir: request.workdir } : {}),
              ...(request.onOutput ? { onOutput: request.onOutput } : {}),
            },
          );
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
          const exited = options.container.containers
            .exec(id, ["sh", "-lc", command], {
              ...(previewOptions?.workdir
                ? { workdir: previewOptions.workdir }
                : {}),
            })
            .then(
              (result) => ({
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
              }),
              (error: unknown) => {
                if (error instanceof ContainerCommandError) {
                  return {
                    exitCode: error.result.exitCode,
                    stdout: error.result.stdout,
                    stderr: error.result.stderr,
                  };
                }
                throw error;
              },
            );
          return { url: previewUrl(hostPort), exited };
        },

        async dispose() {
          disposal ??= options.container.containers.remove([id], {
            force: true,
          });
          await disposal;
        },
      };
    },
  };
}
