import { Octokit } from "octokit";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryCheckoutSource } from "./repository";

function repositoryParts(repository: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = repository.split("/");
  if (!owner || !repo || rest.length) throw new Error("GitHub repository must be owner/name");
  return { owner, repo };
}

function archiveBody(value: unknown): Blob {
  if (value instanceof Blob) return value;
  if (value instanceof Uint8Array) return new Blob([Uint8Array.from(value)]);
  if (value instanceof ArrayBuffer || typeof value === "string") {
    return new Blob([value]);
  }
  throw new Error("GitHub archive response is not binary data");
}

export function createGitHubRepositoryCheckoutSource(options: {
  octokit: Octokit;
  extract?: (archive: string, directory: string) => Promise<void>;
}): RepositoryCheckoutSource {
  const extract = options.extract ?? (async (archive, directory) => {
    const process = Bun.spawn(["tar", "-xzf", archive, "-C", directory, "--strip-components=1"], {
      env: { PATH: Bun.env.PATH },
      stderr: "pipe",
    });
    if (await process.exited) throw new Error(await new Response(process.stderr).text());
  });

  return {
    provider: "github",
    async checkout(input, directory) {
      const archive = join(directory, "repository.tar.gz");
      const response = await options.octokit.rest.repos.downloadTarballArchive({
        ...repositoryParts(input.repository),
        ref: input.revision,
      });
      await Bun.write(archive, archiveBody(response.data));
      try {
        await extract(archive, directory);
      } finally {
        await rm(archive, { force: true });
      }
    },
  };
}
