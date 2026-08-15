import { Octokit } from "octokit";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { RepositoryCheckoutSource } from "./repository";

function repositoryParts(repository: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = repository.split("/");
  if (!owner || !repo || rest.length) throw new Error("GitHub repository must be owner/name");
  return { owner, repo };
}

const issueLinePrefix = "sweat/issue/";

function statusOf(error: unknown): number | undefined {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  )
    return (error as { status: number }).status;
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
  /** Workspace default base; used to mint a missing `sweat/issue/*` ref. */
  fallbackRevision?: string;
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
      const repository = repositoryParts(input.repository);
      let sha: string;
      try {
        sha = (
          await options.octokit.rest.repos.getCommit({
            ...repository,
            ref: input.revision,
          })
        ).data.sha;
      } catch (error) {
        if (
          statusOf(error) !== 404 ||
          !input.revision.startsWith(issueLinePrefix) ||
          !options.fallbackRevision
        )
          throw error;
        sha = (
          await options.octokit.rest.repos.getCommit({
            ...repository,
            ref: options.fallbackRevision,
          })
        ).data.sha;
        try {
          await options.octokit.rest.git.createRef({
            ...repository,
            ref: `refs/heads/${input.revision}`,
            sha,
          });
        } catch (created) {
          if (statusOf(created) !== 422) throw created;
        }
      }
      const archive = join(directory, "repository.tar.gz");
      const response = await options.octokit.rest.repos.downloadTarballArchive({
        ...repository,
        ref: sha,
      });
      await Bun.write(archive, archiveBody(response.data));
      try {
        await extract(archive, directory);
      } finally {
        await rm(archive, { force: true });
      }
      return { revision: sha };
    },
  };
}
