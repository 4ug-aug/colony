import type { ExecutionResult, SandboxProvider } from "../sandboxes";
import { allocateHostPort, publishedPort } from "../sandboxes";
import type { AppleContainerClient } from "../sdk/src";
import { ContainerCommandError } from "../sdk/src";

/**
 * The SDK throws on a non-zero exit; `Sandbox.exec` reports it instead, so the
 * caller can read the command's own output rather than a wrapped error.
 */
function reported(error: unknown): ExecutionResult {
  if (error instanceof ContainerCommandError) {
    return {
      exitCode: error.result.exitCode,
      stdout: error.result.stdout,
      stderr: error.result.stderr,
    };
  }
  throw error;
}

export function createAppleContainerSandboxProvider(options: {
  container: AppleContainerClient;
  createId?: () => string;
  allocatePort?: () => Promise<number>;
}): SandboxProvider {
  const createId =
    options.createId ?? (() => `sandbox-${crypto.randomUUID()}`);
  const allocatePort = options.allocatePort ?? allocateHostPort;

  return {
    async create(spec) {
      const id = createId();
      const publish = await publishedPort(spec, allocatePort);
      await options.container.containers.run(spec.image, {
        name: id,
        detach: true,
        command: ["sh", "-c", "while :; do sleep 3600; done"],
        volumes: spec.volumes,
        ...(publish
          ? { publish: [`127.0.0.1:${publish.host}:${publish.guest}`] }
          : {}),
      });
      let disposal: Promise<void> | undefined;

      return {
        id,
        ...(publish ? { previewUrl: publish.url } : {}),

        exec(request) {
          return options.container.containers
            .exec(id, request.command, {
              ...(request.env ? { env: request.env } : {}),
              ...(request.workdir ? { workdir: request.workdir } : {}),
              ...(request.onOutput ? { onOutput: request.onOutput } : {}),
            })
            .then(
              (result) => ({
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
              }),
              reported,
            );
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
