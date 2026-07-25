import type { SandboxProvider } from "../sandboxes";
import type { AppleContainerClient } from "../sdk/src";

export function createAppleContainerSandboxProvider(options: {
  container: AppleContainerClient;
  createId?: () => string;
}): SandboxProvider {
  const createId =
    options.createId ?? (() => `sandbox-${crypto.randomUUID()}`);

  return {
    async create(spec) {
      const id = createId();
      await options.container.containers.run(spec.image, {
        name: id,
        detach: true,
        command: ["sh", "-c", "while :; do sleep 3600; done"],
        volumes: spec.volumes,
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
            },
          );
          return {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          };
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
