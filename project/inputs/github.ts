import { Octokit } from "octokit";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepositoryCheckoutSource } from "./repository";

function repositoryParts(repository: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = repository.split("/");
  if (!owner || !repo || rest.length) throw new Error("GitHub repository must be owner/name");
  return { owner, repo };
}

const issueLinePrefix = "sweat/issue/";
const lineBranch = "line";

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

async function git(directory: string, args: readonly string[]): Promise<string> {
  const process = Bun.spawn(["git", "-C", directory, ...args], {
    env: { PATH: Bun.env.PATH },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode) throw new Error(stderr.trim() || `git ${args[0]} failed`);
  return stdout;
}

async function replaceWorktree(directory: string, source: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    await rm(join(directory, entry.name), { recursive: true, force: true });
  }
  for (const entry of await readdir(source, { withFileTypes: true })) {
    await cp(join(source, entry.name), join(directory, entry.name), {
      recursive: true,
    });
  }
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
      const commitSha = async (ref: string, mintLine: boolean): Promise<string> => {
        try {
          return (
            await options.octokit.rest.repos.getCommit({
              ...repository,
              ref,
            })
          ).data.sha;
        } catch (error) {
          if (
            !mintLine ||
            statusOf(error) !== 404 ||
            !ref.startsWith(issueLinePrefix) ||
            !options.fallbackRevision
          )
            throw error;
          const sha = (
            await options.octokit.rest.repos.getCommit({
              ...repository,
              ref: options.fallbackRevision,
            })
          ).data.sha;
          try {
            await options.octokit.rest.git.createRef({
              ...repository,
              ref: `refs/heads/${ref}`,
              sha,
            });
          } catch (created) {
            if (statusOf(created) !== 422) throw created;
          }
          return sha;
        }
      };
      const extractRef = async (sha: string, into: string): Promise<void> => {
        const archive = join(into, "repository.tar.gz");
        const response = await options.octokit.rest.repos.downloadTarballArchive({
          ...repository,
          ref: sha,
        });
        await Bun.write(archive, archiveBody(response.data));
        try {
          await extract(archive, into);
        } finally {
          await rm(archive, { force: true });
        }
      };

      const sha = await commitSha(input.revision, true);
      await extractRef(sha, directory);
      const mergeRevisions = (input.mergeRevisions ?? []).filter(
        (ref) => ref && ref !== input.revision,
      );
      if (!mergeRevisions.length) return { revision: sha };

      await git(directory, ["init", "--initial-branch", lineBranch]);
      await git(directory, ["config", "user.name", "Colony Agent"]);
      await git(directory, ["config", "user.email", "agent@colony.local"]);
      await git(directory, ["config", "commit.gpgsign", "false"]);
      await git(directory, ["add", "--all"]);
      await git(directory, ["commit", "--quiet", "--message", "Colony line"]);
      const parent = (await git(directory, ["rev-parse", "HEAD"])).trim();

      for (const [index, ref] of mergeRevisions.entries()) {
        const headSha = await commitSha(ref, false);
        const headDir = await mkdtemp(join(tmpdir(), "sweat-merge-head-"));
        try {
          await extractRef(headSha, headDir);
          const branch = `merge/${index}`;
          await git(directory, ["checkout", "-B", branch, parent]);
          await replaceWorktree(directory, headDir);
          await git(directory, ["add", "--all"]);
          if ((await git(directory, ["status", "--porcelain"])).trim()) {
            await git(directory, [
              "commit",
              "--quiet",
              "--message",
              `Child head ${ref}`,
            ]);
          }
          await git(directory, ["checkout", "-q", lineBranch]);
          await git(directory, ["merge", "--no-edit", branch]);
        } finally {
          await rm(headDir, { recursive: true, force: true });
        }
      }
      return { revision: sha };
    },
  };
}
