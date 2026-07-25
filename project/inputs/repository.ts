import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InputProvisioner, RepositoryInput } from "../agents";

export interface RepositoryCheckoutSource {
  provider: string;
  checkout(input: RepositoryInput, directory: string): Promise<void>;
}

export function createRepositoryWorkspaceProvisioner(options: {
  sources: readonly RepositoryCheckoutSource[];
  createDirectory?: () => Promise<string>;
  removeDirectory?: (directory: string) => Promise<void>;
}): InputProvisioner {
  const sources = new Map(options.sources.map((source) => [source.provider, source]));
  const createDirectory = options.createDirectory ?? (() => mkdtemp(join(tmpdir(), "sweat-run-")));
  const removeDirectory = options.removeDirectory ?? ((directory) => rm(directory, { force: true, recursive: true }));

  return {
    async prepare(inputs) {
      const repositories = inputs.filter((input): input is RepositoryInput => input.type === "repository");
      if (!repositories.length) return {};
      if (repositories.length !== 1 || inputs.length !== 1) {
        throw new Error("A run currently supports one repository workspace");
      }
      const input = repositories[0];
      const source = sources.get(input.provider);
      if (!source) throw new Error(`Unsupported repository provider: ${input.provider}`);
      const path = await createDirectory();
      try {
        await source.checkout(input, path);
      } catch (error) {
        await removeDirectory(path);
        throw error;
      }
      return { workspace: { path, dispose: () => removeDirectory(path) } };
    },
  };
}
